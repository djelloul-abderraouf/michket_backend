import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';
import { CurrentCrmUser } from '../common/decorators/current-crm-user.decorator';
import { CrmStockService } from './crm-stock.service';
import {
  CreateStockItemDto,
  CreateStockMovementDto,
  ManufactureDto,
  SaveRecipeDto,
  UpdateStockItemDto,
} from './dto/crm-stock.dto';

const viewers = ['admin', 'fabrication', 'commercial', 'preparation'] as const;
const editors = ['admin', 'fabrication'] as const;

@ApiTags('CRM Stock')
@Controller('crm/stock')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmStockController {
  constructor(private readonly stock: CrmStockService) {}

  @Get('items')
  @CrmRoles(...viewers)
  @ApiOperation({ summary: 'List stock items with calculated quantities' })
  listItems() {
    return this.stock.listItems();
  }

  @Post('items')
  @CrmRoles(...editors)
  createItem(
    @Body() dto: CreateStockItemDto,
    @CurrentCrmUser() user: { id: string; firstName?: string; lastName?: string; email?: string },
  ) {
    return this.stock.createItem(dto, user);
  }

  @Put('items/:id')
  @CrmRoles(...editors)
  updateItem(@Param('id') id: string, @Body() dto: UpdateStockItemDto) {
    return this.stock.updateItem(id, dto);
  }

  @Get('movements')
  @CrmRoles(...viewers)
  listMovements(
    @Query('itemId') itemId?: string,
    @Query('movementType') movementType?: string,
  ) {
    return this.stock.listMovements(itemId, movementType);
  }

  @Post('movements')
  @CrmRoles(...editors)
  createMovement(
    @Body() dto: CreateStockMovementDto,
    @CurrentCrmUser() user: { id: string; firstName?: string; lastName?: string; email?: string },
  ) {
    return this.stock.createManualMovement(dto, user);
  }

  @Post('movements/:id/reverse')
  @CrmRoles(...editors)
  reverseMovement(
    @Param('id') id: string,
    @CurrentCrmUser() user: { id: string; firstName?: string; lastName?: string; email?: string },
  ) {
    return this.stock.reverseMovement(id, user);
  }

  @Get('recipes')
  @CrmRoles(...viewers)
  listRecipes(@Query('kind') kind?: 'manufacturing' | 'sales') {
    return this.stock.listRecipes(kind);
  }

  @Post('recipes')
  @CrmRoles(...editors)
  saveRecipe(@Body() dto: SaveRecipeDto) {
    return this.stock.saveRecipe(dto);
  }

  @Get('manufacturing')
  @CrmRoles(...viewers)
  listManufacturing() {
    return this.stock.listManufacturing();
  }

  @Post('manufacturing/preview')
  @CrmRoles(...viewers)
  preview(@Body() dto: ManufactureDto) {
    return this.stock.previewManufacture(dto);
  }

  @Post('manufacturing')
  @CrmRoles(...editors)
  manufacture(
    @Body() dto: ManufactureDto,
    @CurrentCrmUser() user: { id: string; firstName?: string; lastName?: string; email?: string },
  ) {
    return this.stock.manufacture(dto, user);
  }

  @Post('manufacturing/:id/cancel')
  @CrmRoles(...editors)
  cancelManufacturing(
    @Param('id') id: string,
    @CurrentCrmUser() user: { id: string; firstName?: string; lastName?: string; email?: string },
  ) {
    return this.stock.cancelManufacturing(id, user);
  }
}
