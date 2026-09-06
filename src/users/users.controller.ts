import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import {
  CreateAddressDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './dto/users.dto';

type AuthenticatedUser = {
  id: string;
  email: string;
  role: 'customer' | 'admin' | 'super_admin';
};

type AuthenticatedRequest = {
  user: AuthenticatedUser;
};

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  async getProfile(
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.findById(
      req.user.id,
    );
  }

  @Put('me')
  @ApiOperation({ summary: 'Update my profile' })
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() body: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(
      req.user.id,
      body,
    );
  }

  @Get('me/addresses')
  @ApiOperation({ summary: 'Get my addresses' })
  async getAddresses(
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.getAddresses(
      req.user.id,
    );
  }

  @Post('me/addresses')
  @ApiOperation({ summary: 'Add an address' })
  async addAddress(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateAddressDto,
  ) {
    return this.usersService.addAddress(
      req.user.id,
      body,
    );
  }

  @Put('me/addresses/:addressId')
  @ApiOperation({ summary: 'Update one of my addresses' })
  async updateAddress(
    @Request() req: AuthenticatedRequest,
    @Param('addressId', ParseUUIDPipe)
    addressId: string,
    @Body() body: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(
      req.user.id,
      addressId,
      body,
    );
  }

  @Delete('me/addresses/:addressId')
  @ApiOperation({ summary: 'Delete one of my addresses' })
  async deleteAddress(
    @Request() req: AuthenticatedRequest,
    @Param('addressId', ParseUUIDPipe)
    addressId: string,
  ) {
    await this.usersService.deleteAddress(
      req.user.id,
      addressId,
    );

    return {
      success: true,
    };
  }
}
