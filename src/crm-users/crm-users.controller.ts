import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';
import { UsersService } from '../users/users.service';

const STAFF_ROLES = [
  'admin',
  'super_admin',
  'commercial',
  'fabrication',
  'preparation',
  'livraison',
  'confirmation',
] as const;

class CreateCrmUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: STAFF_ROLES })
  @IsEnum(STAFF_ROLES)
  role!: (typeof STAFF_ROLES)[number];
}

class UpdateCrmUserDto {
  @ApiPropertyOptional({ enum: STAFF_ROLES })
  @IsOptional()
  @IsEnum(STAFF_ROLES)
  role?: (typeof STAFF_ROLES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

@ApiTags('CRM Users')
@Controller('crm/users')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List CRM users' })
  @CrmRoles('admin')
  async findAll() {
    return this.usersService.findAllForCrm();
  }

  @Post()
  @ApiOperation({ summary: 'Create a CRM staff user' })
  @CrmRoles('admin')
  async create(@Body() dto: CreateCrmUserDto) {
    return this.usersService.createCrmStaff(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a CRM user' })
  @CrmRoles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmUserDto) {
    return this.usersService.updateCrmUser(id, dto);
  }
}
