import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AttachmentTarget, Role } from '../../shared/enums';
import type { Session } from '../../shared/schema';
import { AttachmentEntity } from '../models/attachment.model';
import type { AttachmentRecord } from '../models/attachment.model';
import { CustomerEntity } from '../models/customer.model';
import { CustomerTerritoryEntity } from '../models/customer-territory.model';
import { InvoiceEntity } from '../models/invoice.model';
import { PaymentEntity } from '../models/payment.model';
import { OrganizationEntity } from '../models/organization.model';
import { DatabaseService } from './database.service';
import type { EntityManager } from 'typeorm';

const MAX_ATTACHMENT_BYTES = 1_000_000;
const MAX_ATTACHMENTS_PER_RECORD = 20;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const UNSAFE_FILENAME_PATTERN = /[\\/\x00-\x1f\x7f]/g;

const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(160),
  mediaType: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  contentBase64: z
    .string()
    .min(8)
    .max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4),
});

export interface AttachmentMetadata {
  id: string;
  target: AttachmentTarget;
  targetId: string;
  fileName: string;
  mediaType: string;
  byteLength: number;
  uploadedBy: string;
  uploadedAt: string;
}

function detectMediaType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') {return 'application/pdf';}
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {return 'image/png';}
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) {return 'image/jpeg';}
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    {return 'image/webp';}

  return null;
}

function metadata(record: AttachmentRecord): AttachmentMetadata {
  const { id, target, targetId, fileName, mediaType, byteLength, uploadedBy, uploadedAt } = record;

  return { id, target, targetId, fileName, mediaType, byteLength, uploadedBy, uploadedAt };
}

@Injectable()
export class AttachmentsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private parseTarget(value: string): AttachmentTarget {
    const target = Object.values(AttachmentTarget).find((item) => item === value);
    if (!target) {throw new BadRequestException('Unknown attachment target.');}

    return target;
  }

  private async requireTarget(
    manager: EntityManager,
    session: Session,
    target: AttachmentTarget,
    targetId: string,
  ): Promise<string | null> {
    const organizationId = session.organizationId;
    let customerId: string | null;

    if (target === AttachmentTarget.Customer) {
      const row = await manager
        .getRepository(CustomerEntity)
        .findOneBy({ organizationId, id: targetId });
      if (!row) {throw new NotFoundException('Record was not found.');}
      customerId = row.id;
    } else if (target === AttachmentTarget.Invoice) {
      const row = await manager
        .getRepository(InvoiceEntity)
        .findOneBy({ organizationId, id: targetId });
      if (!row) {throw new NotFoundException('Record was not found.');}
      customerId = row.customerId;
    } else {
      const row = await manager
        .getRepository(PaymentEntity)
        .findOneBy({ organizationId, id: targetId });
      if (!row) {throw new NotFoundException('Record was not found.');}
      customerId = row.customerId;
    }

    if (session.user.role === Role.Sales) {
      const territory = customerId
        ? await manager.getRepository(CustomerTerritoryEntity).findOneBy({
            organizationId,
            customerId,
            userId: session.user.id,
          })
        : null;
      if (!territory)
        {throw new ForbiddenException('This record is outside your assigned territory.');}
    }

    return customerId;
  }

  async list(
    session: Session,
    targetValue: string,
    targetId: string,
  ): Promise<AttachmentMetadata[]> {
    const target = this.parseTarget(targetValue);

    return this.database.transaction(async (manager) => {
      await this.requireTarget(manager, session, target, targetId);
      const rows = await manager.getRepository(AttachmentEntity).find({
        where: { organizationId: session.organizationId, target, targetId },
        select: [
          'id',
          'target',
          'targetId',
          'fileName',
          'mediaType',
          'byteLength',
          'uploadedBy',
          'uploadedAt',
        ],
        order: { uploadedAt: 'DESC' },
      });

      return rows.map(metadata);
    }, true);
  }

  async upload(
    session: Session,
    targetValue: string,
    targetId: string,
    body: object,
  ): Promise<AttachmentMetadata> {
    if (session.user.role === Role.Viewer)
      {throw new ForbiddenException('Your role cannot upload documents.');}
    const target = this.parseTarget(targetValue);
    const input = uploadSchema.parse(body);
    if (!BASE64_PATTERN.test(input.contentBase64))
      {throw new BadRequestException('Invalid document encoding.');}
    const content = Buffer.from(input.contentBase64, 'base64');
    if (
      !content.length ||
      content.length > MAX_ATTACHMENT_BYTES ||
      content.toString('base64') !== input.contentBase64
    )
      {throw new BadRequestException('Document exceeds the 1 MB limit or has invalid encoding.');}
    if (detectMediaType(content) !== input.mediaType)
      {throw new BadRequestException('Document type does not match its contents.');}
    const fileName = input.fileName.replace(UNSAFE_FILENAME_PATTERN, '_').trim();
    if (!fileName) {throw new BadRequestException('A file name is required.');}
    const sha256 = createHash('sha256').update(content).digest('hex');

    return this.database.transaction(async (manager) => {
      if (this.database.connection.options.type === 'postgres') {
        await manager.getRepository(OrganizationEntity).findOne({
          where: { id: session.organizationId },
          lock: { mode: 'pessimistic_write' },
        });
      }
      const customerId = await this.requireTarget(manager, session, target, targetId);
      const repository = manager.getRepository(AttachmentEntity);
      const existing = await repository.findOneBy({
        organizationId: session.organizationId,
        target,
        targetId,
        sha256,
      });
      if (existing) {return metadata(existing);}
      const count = await repository.countBy({
        organizationId: session.organizationId,
        target,
        targetId,
      });
      if (count >= MAX_ATTACHMENTS_PER_RECORD) {
        throw new BadRequestException('This record already has the maximum of 20 documents.');
      }
      await repository
        .createQueryBuilder()
        .insert()
        .values({
          id: randomUUID(),
          organizationId: session.organizationId,
          target,
          targetId,
          customerId,
          fileName,
          mediaType: input.mediaType,
          byteLength: content.length,
          sha256,
          contentBase64: input.contentBase64,
          uploadedBy: session.user.name,
          uploadedAt: new Date().toISOString(),
        })
        .orIgnore()
        .execute();
      const row = await repository.findOneByOrFail({
        organizationId: session.organizationId,
        target,
        targetId,
        sha256,
      });

      return metadata(row);
    });
  }

  async download(
    session: Session,
    id: string,
  ): Promise<{ record: AttachmentMetadata; content: Buffer }> {
    return this.database.transaction(async (manager) => {
      const row = await manager
        .getRepository(AttachmentEntity)
        .findOneBy({ id, organizationId: session.organizationId });
      if (!row) {throw new NotFoundException('Document was not found.');}
      await this.requireTarget(manager, session, row.target, row.targetId);

      return { record: metadata(row), content: Buffer.from(row.contentBase64, 'base64') };
    }, true);
  }
}
