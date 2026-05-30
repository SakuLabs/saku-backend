import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload';
import { AgentService } from '../application/agent.service';
import type { IConversationRepository } from '../domain/conversation.repository.interface';
import { ChatDto } from './dto/chat.dto';

@ApiTags('Agent')
@ApiBearerAuth()
@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    @Inject('IConversationRepository')
    private readonly conversationRepo: IConversationRepository,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with the AI scheduling assistant' })
  @ApiResponse({ status: 201, description: 'Assistant replied' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 502, description: 'AI assistant unavailable' })
  async chat(@Body() body: ChatDto, @CurrentUser() user: JwtPayload | null) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return this.agentService.chat(user.sub, body.content, body.conversationId);
  }

  @Get('conversations')
  @ApiOperation({ summary: "List the user's agent conversations" })
  @ApiResponse({ status: 200, description: 'Conversations retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@CurrentUser() user: JwtPayload | null) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return this.conversationRepo.listByUser(user.sub);
  }
}
