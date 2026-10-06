import { Body, Controller, Get, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthRequest } from '../interfaces/auth-request.interface';
import { SessionGuard } from '../guards/session.guard';
import { AttachmentsService } from '../services/attachments.service';

@Controller('workspace/attachments')
@UseGuards(SessionGuard)
export class AttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}

  @Get(':id/download')
  async download(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { record, content } = await this.attachments.download(request.auth, id);
    response.setHeader('Content-Type', record.mediaType);
    response.setHeader('Content-Length', String(content.length));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(content);
  }

  @Get(':target/:targetId')
  list(
    @Req() request: AuthRequest,
    @Param('target') target: string,
    @Param('targetId') targetId: string,
  ) {
    return this.attachments.list(request.auth, target, targetId);
  }

  @Post(':target/:targetId')
  upload(
    @Req() request: AuthRequest,
    @Param('target') target: string,
    @Param('targetId') targetId: string,
    @Body() body: object,
  ) {
    return this.attachments.upload(request.auth, target, targetId, body);
  }
}
