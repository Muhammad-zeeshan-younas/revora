import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AuthRequest } from '../interfaces/auth-request.interface';
import { SessionGuard } from '../guards/session.guard';
import { OrderInventoryService } from '../services/order-inventory.service';

const orderCursorSchema = z.coerce.number().int().min(0).optional();
const inventoryCursorSchema = z.string().min(2).max(40).optional();

@Controller('workspace')
@UseGuards(SessionGuard)
export class OrderInventoryController {
  constructor(@Inject(OrderInventoryService) private readonly orders: OrderInventoryService) {}

  @Get('inventory')
  inventory(@Req() request: AuthRequest, @Query('cursor') cursor?: string) {
    return this.orders.inventory(request.auth, inventoryCursorSchema.parse(cursor));
  }

  @Post('inventory')
  createItem(@Req() request: AuthRequest, @Body() body: object) {
    return this.orders.createItem(request.auth, body);
  }

  @Post('inventory/:id/adjust')
  adjustStock(@Req() request: AuthRequest, @Param('id') id: string, @Body() body: object) {
    return this.orders.adjustStock(request.auth, id, body);
  }

  @Get('orders')
  listOrders(@Req() request: AuthRequest, @Query('cursor') cursor?: string) {
    return this.orders.orders(request.auth, orderCursorSchema.parse(cursor));
  }

  @Get('orders/holds')
  holds(@Req() request: AuthRequest) {
    return this.orders.visibleHolds(request.auth);
  }

  @Post('orders')
  reserve(@Req() request: AuthRequest, @Body() body: object) {
    return this.orders.reserve(request.auth, body);
  }

  @Post('orders/:id/cancel')
  cancel(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.orders.cancel(request.auth, id);
  }

  @Post('orders/:id/fulfill')
  fulfill(@Req() request: AuthRequest, @Param('id') id: string, @Body() body: object) {
    return this.orders.fulfill(request.auth, id, body);
  }
}
