/**
 * ContactSeeder — generates pre-existing contacts and message threads
 * based on the character card and User Persona, before the RP even starts.
 *
 * Uses SillyTavern's generateQuietPrompt (no chat message generated, no UI
 * change) to ask the current LLM for a JSON seed, then writes it directly
 * into the phone's Messages and Spicy Hub storage.
 *
 * The seed is generated once per chat (flag `seeded: true` in state) unless
 * forced with { force: true }.
 */

export class ContactSeeder {
    constructor(context, storage) {
        this._seed = context || null;
        this.storage = storage;
    }

    _ctx() {
        try {
            const live = globalThis.SillyTavern?.getContext?.();
            if (live) return live;
        } catch { /* ignore */ }
        return this._seed || {};
    }

    /** Returns true if contacts have already been seeded for this chat. */
    isSeeded() {
        return Boolean(this.storage.getState().seeded);
    }

    /**
     * Seed contacts + messages for the current chat.
     * @param {{ force?: boolean, onProgress?: (msg: string) => void }} opts
     */
    async seed({ force = false, onProgress = () => {} } = {}) {
        if (!force && this.isSeeded()) return { skipped: true };

        const ctx = this._ctx();
        if (typeof ctx.generateQuietPrompt !== 'function') {
            throw new Error('generateQuietPrompt недоступен — обновите SillyTavern до актуальной версии.');
        }

        onProgress('Анализирую персонажа…');

        const prompt = this._buildPrompt(ctx);
        let raw;
        try {
            raw = await ctx.generateQuietPrompt(prompt, false, false);
        } catch (err) {
            throw new Error(`Генерация завершилась с ошибкой: ${err?.message || err}`);
        }

        onProgress('Разбираю ответ…');

        const data = this._parse(raw);
        if (!data) throw new Error('Модель вернула некорректный JSON. Попробуй ещё раз (/seed-contacts).');

        this._apply(data);
        onProgress('Готово');
        return { ok: true, contacts: data.contacts?.length ?? 0 };
    }

    /* ─────────────────────────── prompt ─────────────────────────── */

    _buildPrompt(ctx) {
        const charName = ctx.name2 || 'Персонаж';
        const userName = ctx.name1 || 'Пользователь';

        // Pull character card fields if available
        const char = ctx.characters?.[ctx.characterId];
        const charDesc = this._trim(char?.description || char?.personality || '', 600);
        const charScenario = this._trim(char?.scenario || '', 400);

        // Pull User Persona
        const persona = ctx.personas?.[ctx.user_persona] || ctx.persona || {};
        const personaDesc = this._trim(persona?.description || '', 400);
        const personaName = persona?.name || userName;

        return `You are a creative writer preparing background lore for an interactive roleplay.
The main character is: ${charName}${charDesc ? `\nCharacter description: ${charDesc}` : ''}${charScenario ? `\nScenario: ${charScenario}` : ''}
The user's persona is: ${personaName}${personaDesc ? `\nPersona description: ${personaDesc}` : ''}

Generate a realistic set of pre-existing phone contacts and message threads for ${personaName}'s smartphone, fitting the character's world and relationships with ${charName}. Include contacts from ${charName}'s world — friends, colleagues, rivals, or other relevant characters.

IMPORTANT: reply with ONLY a valid JSON object and nothing else. No markdown, no explanation, no code fences.

Schema:
{
  "contacts": [
    {
      "name": "Contact Name",
      "role": "brief relationship to the user/character (e.g. 'best friend', 'manager', 'ex')",
      "messages": [
        {
          "from": "them",
          "text": "message text",
          "minutesAgo": 45
        },
        {
          "from": "me",
          "text": "reply text",
          "minutesAgo": 40
        }
      ]
    }
  ]
}

Rules:
- Generate 3 to 5 contacts.
- Each contact must have 2 to 5 messages, alternating naturally.
- Messages must feel authentic, casual, and contextually appropriate for the scenario.
- "from" is either "them" (contact speaking) or "me" (user/persona speaking).
- minutesAgo counts back from now; higher = older. Range: 5 to 10080 (one week).
- Keep messages concise (under 120 chars each).
- Match the tone and setting of the character's world (fantasy, modern, sci-fi, etc).
- Write messages in the same language as the character card language.`;
    }

    /* ─────────────────────────── parse ─────────────────────────── */

    _parse(raw) {
        const text = String(raw || '').trim();

        // Strip code fences if the model wrapped it anyway
        const cleaned = text
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();

        // Find the first complete {...} block
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start === -1 || end === -1) return null;

        try {
            const obj = JSON.parse(cleaned.slice(start, end + 1));
            if (!Array.isArray(obj?.contacts)) return null;
            return obj;
        } catch {
            return null;
        }
    }

    /* ─────────────────────────── apply ─────────────────────────── */

    _apply(data) {
        const now = Date.now();
        const newMessages = [];

        for (const contact of (data.contacts || [])) {
            const name = String(contact.name || '').trim();
            if (!name) continue;

            for (const msg of (contact.messages || [])) {
                const from = String(msg.from || 'them');
                const text = String(msg.text || '').trim();
                if (!text) continue;

                const minutesAgo = Math.max(1, Number(msg.minutesAgo) || 10);

                newMessages.push({
                    id: `seed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    character: name,
                    role: String(contact.role || ''),
                    text,
                    from,          // 'them' | 'me'
                    isIncoming: from === 'them',
                    timestamp: now - minutesAgo * 60_000,
                    seeded: true,
                });
            }
        }

        // Sort oldest first, then merge with any existing messages
        newMessages.sort((a, b) => a.timestamp - b.timestamp);

        const state = this.storage.getState();
        const existing = Array.isArray(state.messages) ? state.messages : [];

        // Drop old seeded messages so re-seeding is clean
        const kept = existing.filter(m => !m.seeded);
        state.messages = [...newMessages, ...kept];
        state.seeded = true;

        this.storage.save();
    }

    /* ─────────────────────────── utils ─────────────────────────── */

    _trim(str, max) {
        const s = String(str || '').trim().replace(/\s+/g, ' ');
        return s.length > max ? s.slice(0, max) + '…' : s;
    }
}
