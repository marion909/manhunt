import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ChatChannel, MessageType } from '../../common/enums/chat-channel.enum';

export class SendMessageDto {
  @IsEnum(ChatChannel)
  @IsNotEmpty()
  channel: ChatChannel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @IsUUID()
  @IsOptional()
  recipientId?: string; // Required for DIRECT channel

  @IsEnum(MessageType)
  @IsOptional()
  messageType?: MessageType = MessageType.TEXT;
}

export class GetMessagesDto {
  @IsUUID()
  @IsNotEmpty()
  gameId: string;

  @IsEnum(ChatChannel)
  @IsOptional()
  channel?: ChatChannel;

  @IsOptional()
  limit?: number = 50;

  @IsOptional()
  before?: string; // Message ID for pagination
}
