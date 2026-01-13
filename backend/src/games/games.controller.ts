import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GamesService } from './games.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('games')
@Controller('games')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Post()
  @ApiOperation({ summary: 'Create new game' })
  @ApiResponse({ status: 201, description: 'Game created' })
  create(@Body() createGameDto: CreateGameDto, @CurrentUser() user: any) {
    return this.gamesService.create(createGameDto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all games for current user' })
  @ApiResponse({ status: 200, description: 'Games retrieved' })
  findAll(@CurrentUser() user: any) {
    return this.gamesService.findAll(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get game by ID' })
  @ApiResponse({ status: 200, description: 'Game retrieved' })
  @ApiResponse({ status: 404, description: 'Game not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.findOne(id, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update game' })
  @ApiResponse({ status: 200, description: 'Game updated' })
  @ApiResponse({ status: 403, description: 'Only ORGA can update' })
  update(@Param('id') id: string, @Body() updateGameDto: UpdateGameDto, @CurrentUser() user: any) {
    return this.gamesService.update(id, updateGameDto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete game' })
  @ApiResponse({ status: 200, description: 'Game deleted' })
  @ApiResponse({ status: 403, description: 'Only creator can delete' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gamesService.remove(id, user.userId);
  }
}
