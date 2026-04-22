import { buildConversationContext } from "@/lib/context/build-conversation-context";
import { classifyInputType } from "@/lib/context/classify-input";
import { normalizeTelegramInput } from "@/lib/context/normalize-telegram-input";
import { runAnalysis } from "@/lib/pipeline/run-analysis";
import {
  addArtifact,
  addCaseSnapshot,
  addMessage,
  addPromptTrace,
  getConversationArtifacts,
  getConversationMessages,
  getLatestSnapshotForConversation,
  getOrCreateConversation,
  getOrCreateOpenCase,
  getOrCreateUser,
} from "@/lib/persistence/repository";
import { runRenderer } from "@/lib/pipeline/run-renderer";
import { runRouter } from "@/lib/pipeline/run-router";
import type { FinalResponse } from "@/schemas/response.schema";

export async function runTelegramDecisionEngine(params: {
  telegramUserId: number;
  telegramChatId: number;
  telegramMessageId: number | null;
  telegramUsername?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  text?: string | null;
  caption?: string | null;
  voiceTranscript?: string | null;
  imageContext?: string | null;
  websiteContext?: Record<string, unknown> | null;
}) {
  const normalizedInput = normalizeTelegramInput({
    text: params.voiceTranscript || params.text,
    caption: params.caption,
    hasVoice: Boolean(params.voiceTranscript),
    hasImage: Boolean(params.imageContext),
  });

  const normalizedText = [
    normalizedInput.text,
    params.imageContext ? `Контекст изображения: ${params.imageContext}` : null,
    params.websiteContext ? `Контекст сайта: ${JSON.stringify(params.websiteContext)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const user = await getOrCreateUser({
    telegramUserId: params.telegramUserId,
    username: params.telegramUsername,
    firstName: params.firstName,
    lastName: params.lastName,
  });

  const conversation = await getOrCreateConversation({
    userId: user.id,
    telegramChatId: params.telegramChatId,
  });

  const userMessage = await addMessage({
    conversationId: conversation.id,
    role: "user",
    messageType: normalizedInput.messageType,
    rawText: params.text ?? params.caption ?? null,
    normalizedText,
    telegramMessageId: params.telegramMessageId,
    metadataJson: {
      voiceTranscript: params.voiceTranscript,
    },
  });

  const artifacts = [];

  if (params.voiceTranscript) {
    artifacts.push(
      await addArtifact({
        conversationId: conversation.id,
        messageId: userMessage.id,
        artifactType: "audio_transcript",
        contentJson: { transcript: params.voiceTranscript },
        sourceUrl: null,
        storagePath: null,
      }),
    );
  }

  if (params.imageContext) {
    artifacts.push(
      await addArtifact({
        conversationId: conversation.id,
        messageId: userMessage.id,
        artifactType: "image_context",
        contentJson: { summary: params.imageContext },
        sourceUrl: null,
        storagePath: null,
      }),
    );
  }

  if (params.websiteContext) {
    artifacts.push(
      await addArtifact({
        conversationId: conversation.id,
        messageId: userMessage.id,
        artifactType: "website_context",
        contentJson: params.websiteContext,
        sourceUrl: typeof params.websiteContext.url === "string" ? params.websiteContext.url : null,
        storagePath: null,
      }),
    );
  }

  const conversationContext = buildConversationContext({
    messages: await getConversationMessages(conversation.id),
    artifacts: await getConversationArtifacts(conversation.id),
    latestSnapshot: await getLatestSnapshotForConversation(conversation.id),
  });

  const inputType = classifyInputType(normalizedInput.text);

  const routerDecision = await runRouter({
    inputType,
    normalizedText,
    conversationContext,
    artifacts,
  });

  await addPromptTrace({
    conversationId: conversation.id,
    caseId: null,
    stage: "router",
    promptVersion: "router_v2",
    inputJson: {
      inputType,
      normalizedText,
      conversationContext,
      artifacts,
    },
    outputJson: routerDecision as unknown as Record<string, unknown>,
    validationStatus: "valid",
  });

  const analysisResult =
    routerDecision.nextAction === "screen" || routerDecision.nextAction === "diagnose"
      ? await runAnalysis({
          mode: routerDecision.mode,
          normalizedText,
          conversationContext,
          artifacts,
          routerDecision,
        })
      : {
          preliminaryScreening: null,
          diagnosticCase: null,
        };

  if (routerDecision.nextAction === "screen" || routerDecision.nextAction === "diagnose") {
    await addPromptTrace({
      conversationId: conversation.id,
      caseId: null,
      stage: "diagnostic",
      promptVersion: "diagnostic_v1",
      inputJson: {
        mode: routerDecision.mode,
        normalizedText,
        conversationContext,
        artifacts,
        routerDecision,
      },
      outputJson: analysisResult as unknown as Record<string, unknown>,
      validationStatus: "valid",
    });
  }

  const replyText = await runRenderer({
    routerDecision,
    analysisResult,
  });

  await addPromptTrace({
    conversationId: conversation.id,
    caseId: null,
    stage: "renderer",
    promptVersion: "renderer_v2",
    inputJson: {
      routerDecision,
      analysisResult,
    },
    outputJson: { replyText },
    validationStatus: "valid",
  });

  const assistantMessage = await addMessage({
    conversationId: conversation.id,
    role: "assistant",
    messageType: "text",
    rawText: replyText,
    normalizedText: replyText,
    telegramMessageId: null,
    metadataJson: {
      mode: routerDecision.mode,
      nextAction: routerDecision.nextAction,
    },
  });

  const caseRecord = await getOrCreateOpenCase({
    userId: user.id,
    conversationId: conversation.id,
    title: routerDecision.insight ?? normalizedInput.text ?? null,
  });

  const finalResponse: FinalResponse = {
    inputType: routerDecision.inputType,
    mode: routerDecision.mode,
    nextAction: routerDecision.nextAction,
    confidence: routerDecision.confidence,
    insight: routerDecision.insight,
    replyText,
    question: routerDecision.question,
    preliminaryScreening: analysisResult.preliminaryScreening,
    diagnosticCase: analysisResult.diagnosticCase,
  };

  const snapshot = await addCaseSnapshot({
    caseId: caseRecord.id,
    action: routerDecision.nextAction,
    confidence: routerDecision.confidence,
    routerReason: routerDecision.routerReason,
    replyText,
    structuredOutputJson: finalResponse as unknown as Record<string, unknown>,
  });

  if (analysisResult.preliminaryScreening) {
    await addArtifact({
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      artifactType: "preliminary_screening",
      contentJson: analysisResult.preliminaryScreening as unknown as Record<string, unknown>,
      sourceUrl: null,
      storagePath: null,
    });
  }

  if (analysisResult.diagnosticCase) {
    await addArtifact({
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      artifactType: "diagnostic_case",
      contentJson: analysisResult.diagnosticCase as unknown as Record<string, unknown>,
      sourceUrl: null,
      storagePath: null,
    });
  }

  return {
    replyText,
    snapshotId: snapshot.id,
    finalResponse,
    conversationId: conversation.id,
    caseId: caseRecord.id,
  };
}
