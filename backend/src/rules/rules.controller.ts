import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { RulesService, CreateRuleDto, UpdateRuleDto } from './rules.service';
import { GameRule } from './entities/game-rule.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('games/:gameId/rules')
@UseGuards(JwtAuthGuard)
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  async createRule(
    @Param('gameId') gameId: string,
    @Body() dto: CreateRuleDto,
  ): Promise<GameRule> {
    return this.rulesService.createRule(gameId, dto);
  }

  @Get()
  async getRules(@Param('gameId') gameId: string): Promise<GameRule[]> {
    return this.rulesService.getRules(gameId);
  }

  @Patch(':id')
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ): Promise<GameRule> {
    return this.rulesService.updateRule(id, dto);
  }

  @Delete(':id')
  async deleteRule(@Param('id') id: string): Promise<void> {
    return this.rulesService.deleteRule(id);
  }
}
