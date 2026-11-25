import { getSystemPrompt, getUserPromptTemplate, IntentSchema } from '../../prompts/v1/identifyIntent.ts';
import { professionals } from '../../services/appointmentService.ts';
import { OpenRouterService } from '../../services/openRouterService.ts';
import type { GraphState } from '../graph.ts';

function normalizeText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractPatientName(input: string) {
  const match = input.match(/(?:sou|me chamo)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){1,4}?)(?=,|\s+e\s|\s+que\s|$)/i);
  return match?.[1]?.trim();
}

function extractProfessional(input: string) {
  const normalizedInput = normalizeText(input);
  return professionals.find((professional) => normalizedInput.includes(normalizeText(professional.name)));
}

function extractDateTimeISO(input: string) {
  const normalizedInput = normalizeText(input);
  const now = new Date();
  const date = new Date(now);

  if (normalizedInput.includes('amanha')) {
    date.setDate(date.getDate() + 1);
  }

  const hourMatch = normalizedInput.match(/(\d{1,2})\s*h/);
  if (!hourMatch) {
    return undefined;
  }

  const hour = Number(hourMatch[1]);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) {
    return undefined;
  }

  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function fallbackIntentFromText(input: string): Partial<GraphState> {
  const normalizedInput = normalizeText(input);
  const professional = extractProfessional(input);
  const patientName = extractPatientName(input);
  const datetime = extractDateTimeISO(input);

  const isCancel = /\bcancel|cancele|cancelar\b/.test(normalizedInput);
  const isSchedule = /\bagendar|marcar|consulta\b/.test(normalizedInput);

  if (isCancel) {
    return {
      intent: 'cancel',
      professionalId: professional?.id,
      professionalName: professional?.name,
      patientName,
      datetime,
    };
  }

  if (isSchedule) {
    return {
      intent: 'schedule',
      professionalId: professional?.id,
      professionalName: professional?.name,
      patientName,
      datetime,
      reason: 'general consultation',
    };
  }

  return { intent: 'unknown' };
}

export function createIdentifyIntentNode(llmClient: OpenRouterService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    console.log(`🔍 Identifying intent...`);
    const input = state.messages.at(-1)!.text;

    try {
      const systemPrompt = getSystemPrompt(professionals)
      const userPrompt = getUserPromptTemplate(input)
      const result = await llmClient.generateStructured(
        systemPrompt,
        userPrompt,
        IntentSchema,
      )
      if (!result.success || !result.data) {
        console.log(`⚠️  Intent identification failed: ${result.error}`);
        const fallback = fallbackIntentFromText(input);
        console.log(`🧭 Using local fallback intent: ${fallback.intent}`);
        return fallback;
      }

      const intentData = result.data!
      console.log(`✅ Intent identified: ${intentData.intent}`);

      return {
        ...intentData,
      };

    } catch (error) {
      console.error('❌ Error in identifyIntent node:', error);
      const fallback = fallbackIntentFromText(input);
      console.log(`🧭 Using local fallback intent after exception: ${fallback.intent}`);
      return {
        ...fallback,
      };
    }
  };
}
