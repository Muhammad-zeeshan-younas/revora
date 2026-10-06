import { EntitySchema } from 'typeorm';
import { AttachmentTarget } from '../../shared/enums';

export interface AttachmentRecord {
  id: string;
  organizationId: string;
  target: AttachmentTarget;
  targetId: string;
  customerId: string | null;
  fileName: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
  contentBase64: string;
  uploadedBy: string;
  uploadedAt: string;
}

export const AttachmentEntity = new EntitySchema<AttachmentRecord>({
  name: 'Attachment',
  tableName: 'attachments',
  columns: {
    id: { type: 'varchar', primary: true },
    organizationId: { type: 'varchar' },
    target: { type: 'varchar' },
    targetId: { type: 'varchar' },
    customerId: { type: 'varchar', nullable: true },
    fileName: { type: 'varchar' },
    mediaType: { type: 'varchar' },
    byteLength: { type: 'integer' },
    sha256: { type: 'varchar' },
    contentBase64: { type: 'text' },
    uploadedBy: { type: 'varchar' },
    uploadedAt: { type: 'varchar' },
  },
  indices: [
    { columns: ['organizationId', 'target', 'targetId', 'uploadedAt'] },
    { columns: ['organizationId', 'customerId'] },
  ],
  uniques: [{ columns: ['organizationId', 'target', 'targetId', 'sha256'] }],
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
    },
  ],
});
