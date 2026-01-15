import { Controller, Get, Query, UseGuards, Param, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatChannel } from '../common/enums/chat-channel.enum';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get(':gameId/messages')
  async getMessages(
    @Param('gameId') gameId: string,
    @Query('channel') channel?: ChatChannel,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.chatService.getMessages(
      gameId,
      channel,
      limit ? parseInt(limit, 10) : 50,
      before,
    );
  }

  @Get(':gameId/direct/:participantId')
  async getDirectMessages(
    @Param('gameId') gameId: string,
    @Param('participantId') otherParticipantId: string,
    @Request() req,
    @Query('limit') limit?: string,
  ) {
    // Current user's participant ID would come from JWT
    const currentParticipantId = req.user.sub;
    
    return this.chatService.getDirectMessages(
      gameId,
      currentParticipantId,
      otherParticipantId,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
