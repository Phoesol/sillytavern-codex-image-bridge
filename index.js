import {
    chat,
    eventSource,
    event_types,
    saveChatConditional,
    saveSettingsDebounced,
    scrollChatToBottom,
    updateMessageBlock,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { getContext } from '../../../st-context.js';
import { MEDIA_TYPE } from '../../../constants.js';
import { toggleDrawer } from '../../../utils.js';

const extensionName = 'codex-image-bridge';
const settingsUrl = '/scripts/extensions/third-party/codex-image-bridge/settings.html';
const runningMessages = new Set();
let completedResultRefreshTimer = null;
let completedResultRefreshRunning = false;
let lastCompletedResultRefresh = 0;
const imageFolderName = 'codex-image-bridge';
const cacheFileName = 'codex-image-bridge-cache.json';
const cacheSchema = 'codex-image-bridge.cache.v1';
const characterFileName = 'codex-image-bridge-characters.json';
const characterSchema = 'codex-image-bridge.characters.v1';
const outfitFileName = 'codex-image-bridge-outfits.json';
const outfitSchema = 'codex-image-bridge.outfits.v1';
const assetFileName = 'codex-image-bridge-assets.json';
const assetSchema = 'codex-image-bridge.assets.v1';
const memoryFileName = 'codex-image-bridge-memory.json';
const memorySchema = 'codex-image-bridge.memory.v1';
const stateFileName = 'codex-image-bridge-state.json';
const stateSchema = 'codex-image-bridge.state.v1';
const cachePageSize = 24;
const settingsSchemaVersion = 7;
const inlineImageStartMarker = '<!-- codex-image-bridge-inline-start -->';
const inlineImageEndMarker = '<!-- codex-image-bridge-inline-end -->';
const imagePriorityPromptBlock = `Visual priority order:
1. Adult female characters are the primary subject when present. Prioritize their face, expression, body language, outfit continuity, and relationship to the current action.
2. Natural landscapes, landmarks, scenic areas, and recognizable places are the second priority when the reply mentions them. Show them clearly as the environment, not as a replacement for the character.
3. Props, documents, vehicles, food, UI-like elements, and other details are supporting context.
Generate images in chronological order across the latest reply so they can be inserted between relevant paragraphs.`;
const naturalStoryStyle = 'natural realistic photography, candid documentary still, real skin texture, believable lens perspective, available light, grounded everyday detail, no painterly illustration, no anime, no CGI, no plastic skin, no watermark, no text';
const selectedCacheImages = new Set();
const selectedCharacterIds = new Set();
const selectedOutfitIds = new Set();
const selectedAssetIds = new Set();
let cacheImages = [];
let cachePage = 1;
let cacheMultiSelect = false;
let characterLibrary = null;
let outfitLibrary = null;
let assetLibrary = null;
let appActivePage = 'dashboard';
let cacheViewMode = 'medium';
let characterViewMode = 'medium';
let outfitViewMode = 'medium';
let assetViewMode = 'medium';
let selectedCharacterId = '';
let activityStateTimer = null;
let floatingPanelOpen = false;
let legacyReferenceMigrationAttempted = false;
let bridgeAppDragState = null;

const promptPresets = {
    'story-cinematic': {
        label: '真实自然摄影',
        text: 'Natural realistic photography, candid documentary still, coherent real location, believable character acting, real skin texture, available light, natural lens perspective, restrained color grading, no painterly illustration, no anime, no CGI, no watermark, no unnecessary text.',
    },
    'portrait-a': {
        label: '肖像A 便利店霓虹',
        text: 'Adult portrait, 35mm film photography, harsh convenience store fluorescent lighting mixed with colorful neon signs outside, authentic film grain, high contrast, cinematic street editorial style, intimate medium shot, late-night convenience store atmosphere, realistic reflections on glass, natural skin texture, urban portrait energy, no watermark, no text.',
    },
    'portrait-b': {
        label: '肖像B 暖卧室胶片',
        text: '9:16 vertical candid portrait of an adult woman in a dim bedroom, warm amber bedside lamp, lived-in room details, soft background blur, face and shoulders in sharp focus, natural skin texture, gentle eye contact, retro film grain, warm soft color, low contrast, subtle vignette, intimate natural photo style, no watermark, no text.',
    },
    'portrait-c': {
        label: '肖像C 日系富士',
        text: '9:16 vertical adult portrait, Japanese Fujifilm simulation look, Pro 400H or Superia style, soft pastel colors, slight green-magenta tint, low contrast, delicate film grain, soft highlights, bright diffused window light, clean daily interior, relaxed front-facing pose, fresh youthful mood, no watermark, no text.',
    },
    'cos-a': {
        label: 'Cos 恋爱游戏截图',
        text: '9:16 vertical phone screenshot style. Realistic adult coser with subtle anime influence in a cafe, bar, or relaxed indoor scene. Add a believable phone status bar at the top. Add a translucent visual-novel dialogue box at the bottom with a small character avatar, character name, and one or two warm dialogue lines. High detail, soft light, natural blend of anime and real photography.',
    },
    'portrait-d': {
        label: '肖像D 城市街头',
        text: 'Medium close-up adult street portrait at eye level, over-shoulder glance, clear playful eyes, natural makeup, golden natural light from upper left, soft backlight, mild lens flare, city street with crosswalk, road markings, trees and distant vehicles slightly blurred but readable, casual urban fashion, energetic city aesthetic, no watermark, no text.',
    },
    'portrait-e': {
        label: '肖像E 黑雾室内',
        text: '9:16 vertical editorial adult portrait, soft black mist filter, subtle haze, gentle highlight bloom, low-key tone, minimalist textured interior, natural skin, soft side light, relaxed seated floor pose, off-center composition with negative space, quiet restrained mood, fine grain, realistic and slightly soft, no watermark, no text.',
    },
    'portrait-f': {
        label: '肖像F 午后日系',
        text: 'Adult woman in warm afternoon interior light, natural makeup, transparent skin texture, soft eye contact, relaxed seated pose, beige sofa, white curtains, warm table lamp, indoor plants, vertical close portrait from upper body to waist, slight high angle, 50mm equivalent, shallow depth of field, 4K realistic photography, detailed hair and fabric texture, warm Japanese portrait color grading, no watermark, no text.',
    },
};

const defaultPromptTemplate = `You are Codex Image Bridge.
Generate {{imageCount}} distinct natural realistic photographic images for the latest SillyTavern assistant reply.
Keep character identity, outfit, scene continuity, and mood consistent.
Vary framing, camera angle, and exact moment.
All depicted people must be adults.
Unless the selected preset explicitly asks for UI/text, do not render UI, subtitles, captions, chat bubbles, logos, or watermarks.
If the latest reply does not change location, time, weather, outfit, or props, preserve the recent visual memory.
Use character reference images only as identity anchors when available. Preserve face shape, facial proportions, eyes, mouth and smile, age impression, body type, natural posture, hairstyle, and stable temperament. Do not copy clothing, jewelry, props, background, lighting, exact pose, or accessories from character reference images unless the story explicitly asks for them.
Style target: realistic natural photo first. Avoid illustration, painterly concept art, anime, glossy CGI, doll-like skin, excessive cinematic grading, and overdesigned lighting.
${imagePriorityPromptBlock}

Character: {{characterName}}
User: {{userName}}
Style: {{style}}
Size: {{size}}
Selected visual preset:
{{promptPreset}}

Character library profile:
{{characterProfile}}

Matched character profiles:
{{characterProfiles}}

Character reference images:
Use these images as identity-only references. They define facial structure, facial proportions, eyes, mouth/smile, age impression, body type, posture tendency, hairstyle, and stable temperament only. Ignore clothing, accessories, props, background, lighting, and exact pose unless explicitly requested by the story.
{{characterReferences}}

Recent compact visual memory:
{{visualMemory}}

Bubble dialogue parsed from Tavern Helper / 气泡音:
{{bubbleDialogue}}

Worldbook image directives:
{{imageDirectives}}

Media/UI blocks to render:
{{mediaBlocks}}

Latest assistant reply:
{{replyText}}

Recent context:
{{recentContext}}`;

const fastPromptTemplate = `You are Codex Image Bridge.
Fast mode. Generate {{imageCount}} natural realistic 512x512 photographic story images for the latest SillyTavern assistant reply.
Keep adult character identity, outfit, location, and mood consistent. Use simple candid composition, believable lens perspective, and natural available light.
Do not render text, UI, subtitles, captions, chat bubbles, logos, or watermarks.
Use character reference images only for identity: face shape, facial proportions, eyes, mouth and smile, age impression, body type, natural posture, hairstyle, and stable temperament. Do not copy clothes, jewelry, props, background, lighting, exact pose, or accessories from character reference images unless the story explicitly asks for them.
Style target: realistic natural photo first. Avoid illustration, painterly concept art, anime, glossy CGI, doll-like skin, excessive cinematic grading, and overdesigned lighting.
${imagePriorityPromptBlock}

Character: {{characterName}}
Style: {{style}}
Scene memory:
{{visualMemory}}

Character profile:
{{characterProfile}}

Matched character profiles:
{{characterProfiles}}

Character reference images:
Use these images as identity-only references. They define facial structure, facial proportions, eyes, mouth/smile, age impression, body type, posture tendency, hairstyle, and stable temperament only. Ignore clothing, accessories, props, background, lighting, and exact pose unless explicitly requested by the story.
{{characterReferences}}

Latest assistant reply:
{{replyText}}

Recent context:
{{recentContext}}`;

const defaultSettings = {
    enabled: true,
    fastMode: true,
    minImages: 3,
    maxImages: 6,
    size: '512x512',
    style: naturalStoryStyle,
    promptPreset: 'story-cinematic',
    contextMessages: 4,
    memoryItems: 4,
    memoryEntries: 24,
    memoryMaxChars: 700,
    characterReferenceCount: 2,
    useWorldbookDirectives: true,
    renderMediaBlocks: true,
    hideDirectiveMarkup: true,
    maxReplyChars: 5000,
    resultPollMs: 2000,
    resultTimeoutMs: 86400000,
    automationActiveMinutes: 30,
    promptTemplate: defaultPromptTemplate,
    floatingButton: true,
    uiTheme: 'auto',
    appZoom: 1,
    appOffsetX: 0,
    appOffsetY: 0,
    ignoreMessagesBefore: '',
    settingsSchemaVersion,
};

function getSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }

    const settings = extension_settings[extensionName];
    if (!settings.settingsSchemaVersion || settings.settingsSchemaVersion < settingsSchemaVersion) {
        migrateSettings(settings);
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = value;
        }
    }

    return settings;
}

function migrateSettings(settings) {
    if (!settings.settingsSchemaVersion) {
        if (settings.size === undefined || settings.size === '1024x1024') {
            settings.size = '512x512';
        }
        if (settings.resultPollMs === undefined || Number(settings.resultPollMs) >= 10000) {
            settings.resultPollMs = 2000;
        }
    }
    if (Number(settings.settingsSchemaVersion || 0) < 4 && typeof settings.promptTemplate === 'string') {
        settings.promptTemplate = ensurePromptTemplatePolicy(settings.promptTemplate);
    }
    if (Number(settings.settingsSchemaVersion || 0) < 5) {
        settings.style = normalizeNaturalStyleSetting(settings.style);
        settings.promptTemplate = normalizeNaturalPromptTemplate(settings.promptTemplate);
    }
    if (Number(settings.settingsSchemaVersion || 0) < 6) {
        if (settings.characterReferenceCount === undefined || Number(settings.characterReferenceCount) < defaultSettings.characterReferenceCount) {
            settings.characterReferenceCount = defaultSettings.characterReferenceCount;
        }
    }
    if (Number(settings.settingsSchemaVersion || 0) < 7) {
        settings.promptTemplate = normalizeReferencePolicyPromptTemplate(settings.promptTemplate);
    }
    settings.settingsSchemaVersion = settingsSchemaVersion;
}

function ensurePromptTemplatePolicy(template = '') {
    const text = String(template || '').trim();
    if (!text) {
        return defaultPromptTemplate;
    }
    if (text.includes('Visual priority order:')) {
        return text;
    }
    return `${text}\n\n${imagePriorityPromptBlock}`;
}

function normalizeNaturalStyleSetting(style = '') {
    const text = String(style || '').trim();
    if (!text || /illustration|story sketch|concept art|anime|CGI/i.test(text)) {
        return naturalStoryStyle;
    }
    if (/realistic|photography|photo|documentary|natural/i.test(text)) {
        return text;
    }
    return `${text}, ${naturalStoryStyle}`;
}

function normalizeNaturalPromptTemplate(template = '') {
    const text = ensurePromptTemplatePolicy(template || defaultPromptTemplate);
    if (text.includes('Style target: realistic natural photo first.')) {
        return normalizeReferencePolicyPromptTemplate(text
            .replace(/distinct illustrations/g, 'distinct natural realistic photographic images')
            .replace(/narrative illustrations/g, 'natural realistic photographic story images'));
    }
    return normalizeReferencePolicyPromptTemplate(text
        .replace(/distinct illustrations/g, 'distinct natural realistic photographic images')
        .replace(/narrative illustrations/g, 'natural realistic photographic story images')
        .replace(/Keep character identity, outfit, scene continuity, and mood consistent\./, 'Keep character identity, outfit, scene continuity, and mood consistent.\nStyle target: realistic natural photo first. Avoid illustration, painterly concept art, anime, glossy CGI, doll-like skin, excessive cinematic grading, and overdesigned lighting.'));
}

function normalizeReferencePolicyPromptTemplate(template = '') {
    const policy = 'Use character reference images only as identity anchors when available. Preserve face shape, facial proportions, eyes, mouth and smile, age impression, body type, natural posture, hairstyle, and stable temperament. Do not copy clothing, jewelry, props, background, lighting, exact pose, or accessories from character reference images unless the story explicitly asks for them.';
    let text = String(template || defaultPromptTemplate);
    text = text
        .replace(/Use character reference images as identity anchors when available\.[^\n]*/i, policy)
        .replace(/Use character reference images only as identity anchors when available\.[^\n]*/i, policy)
        .replace(/Use character reference images only for identity:[^\n]*/i, policy);
    if (!/Use character reference images only as identity anchors/i.test(text)) {
        text = text.replace(
            /Unless the selected preset explicitly asks for UI\/text, do not render UI, subtitles, captions, chat bubbles, logos, or watermarks\./,
            `$&\n${policy}`,
        );
        text = text.replace(
            /Do not render text, UI, subtitles, captions, chat bubbles, logos, or watermarks\./,
            `$&\n${policy}`,
        );
    }
    return text;
}

function clampInteger(value, fallback, min, max) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, number));
}

function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, number));
}

function truncateText(value, limit) {
    const text = String(value || '').trim();
    if (text.length <= limit) {
        return text;
    }
    return `${text.slice(0, Math.max(0, limit - 16)).trim()}...`;
}

function makeId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function chooseImageCount(settings) {
    const min = clampInteger(settings.minImages, defaultSettings.minImages, 1, 6);
    const max = clampInteger(settings.maxImages, defaultSettings.maxImages, min, 6);
    return min + Math.floor(Math.random() * (max - min + 1));
}

function getGenerationSettings(settings = getSettings()) {
    if (!settings.fastMode) {
        return settings;
    }

    return {
        ...settings,
        minImages: 3,
        maxImages: 3,
        size: '512x512',
        contextMessages: 2,
        memoryItems: 2,
        memoryMaxChars: 360,
        characterReferenceCount: 2,
        maxReplyChars: 2200,
        promptTemplate: fastPromptTemplate,
        style: normalizeNaturalStyleSetting(settings.style),
    };
}

function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function renderPromptTemplate(template, replacements) {
    return String(template || defaultPromptTemplate).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const value = replacements[key];
        if (Array.isArray(value) || (value && typeof value === 'object')) {
            return JSON.stringify(value, null, 2);
        }
        return String(value ?? '');
    });
}

function parseTagAttributes(value = '') {
    const attributes = {};
    const pattern = /([a-zA-Z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let match;
    while ((match = pattern.exec(value))) {
        attributes[match[1]] = match[3] ?? match[4] ?? '';
    }
    return attributes;
}

function extractHtmlFromBlock(value = '') {
    const fenced = String(value).match(/```(?:html)?\s*([\s\S]*?)```/i);
    return (fenced ? fenced[1] : value).trim();
}

function decodeHtmlEntities(value = '') {
    if (typeof document === 'undefined') {
        return String(value || '');
    }
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value || '');
    return textarea.value;
}

function looksLikeHtml(value = '') {
    return /<!doctype\s+html|<html\b|<head\b|<body\b|<script\b|<style\b|<xmp\b|<div\b|<section\b|<article\b|<table\b/i.test(String(value || ''));
}

function escapeRegExp(value = '') {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractEmbeddedStoryText(value = '') {
    const text = String(value || '');
    const contentMatches = Array.from(text.matchAll(/<content\b[^>]*>([\s\S]*?)<\/content>/gi));
    if (contentMatches.length > 0) {
        return decodeHtmlEntities(contentMatches.map(match => match[1]).join('\n\n'));
    }

    const xmpMatch = text.match(/<xmp\b[^>]*\bid=["']dcSource["'][^>]*>([\s\S]*?)<\/xmp>/i)
        || text.match(/<xmp\b[^>]*>([\s\S]*?)<\/xmp>/i);
    if (xmpMatch) {
        return decodeHtmlEntities(xmpMatch[1]);
    }

    return text;
}

function stripTaggedBlocks(value = '', tags = []) {
    let text = String(value || '');
    for (const tag of tags) {
        const name = escapeRegExp(tag);
        text = text.replace(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}\\s*>`, 'gi'), '\n');
    }
    return text;
}

function stripNonStoryBlocks(value = '') {
    return stripTaggedBlocks(value, [
        'thinking', 'think', 'codex-think', 'imgthink', 'SearchResults', 'fox_outline', 'fox_memory',
        'UpdateVariable', 'Analysis', 'JSONPatch', 'StatusBar', 'WorldState', 'map_rule', 'command',
        'snow', 'details', 'summary', 'script', 'style', 'svg', 'head', 'table', 'initvar', 'now_plot',
        '开场白', '摘要', '行动选项',
    ])
        .replace(/<!--[\s\S]*?-->/g, '\n')
        .replace(/```(?:html|css|javascript|js|json|xml|mermaid)?[\s\S]*?```/gi, block => {
            const body = block.replace(/^```[^\n]*\n?/, '').replace(/```$/g, '').trim();
            if (body.length <= 140 && !looksLikeHtml(body) && !/[{};<>]/.test(body)) {
                return `\n${body}\n`;
            }
            return '\n';
        })
        .replace(/!\[[^\]]*]\([^)]+\)/g, '\n')
        .replace(/\[[^\]]+]\((?:\/?user\/images|data\/default-user\/user\/images|https?:)[^)]+\)/gi, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeStoryLine(line = '') {
    const bubbleLine = renderBubbleLineForPrompt(line);
    return String(bubbleLine || '')
        .replace(/<\/?(?:content|time)\b[^>]*>/gi, '')
        .replace(/<\/?[a-z][\w:-]*\b[^>]*>/gi, '')
        .replace(/^\s*#{1,6}\s*/, '')
        .replace(/^[`*_~\s]+|[`*_~\s]+$/g, '')
        .trim();
}

function isWhitelistedStoryLine(line = '') {
    const text = String(line || '').trim();
    if (!text) {
        return false;
    }
    if (/^(@(?!bubble:)|<\/?|```|---+$)/.test(text)) {
        return false;
    }
    if (/^\|.*\|$/.test(text) || /^\s*[-|:]{3,}\s*$/.test(text)) {
        return false;
    }
    if (/^\s*[\[{].*[\]}]\s*$/.test(text) && !/[。！？：“”]/.test(text)) {
        return false;
    }
    if (/^(config|theme|layout|class|style|function|const|let|var|return)\b/i.test(text)) {
        return false;
    }
    return /[\u4e00-\u9fa5A-Za-z0-9]/.test(text);
}

function extractStoryText(value = '') {
    const source = decodeHtmlEntities(extractEmbeddedStoryText(stripBridgeMarkup(value)));
    const text = stripNonStoryBlocks(source);
    const lines = text.split(/\r?\n/)
        .map(normalizeStoryLine)
        .filter(isWhitelistedStoryLine);
    return lines.join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeBubbleText(value = '') {
    return String(value || '')
        .replace(/^["“]+|["”]+$/g, '')
        .replace(/^\[|\]$/g, '')
        .trim();
}

function parseBubbleLine(line = '') {
    const text = String(line || '').trim();
    if (!text.startsWith('@bubble:')) {
        return null;
    }

    let match = text.match(/^@bubble:([^|\n]+)\|([^|\n]*)\|\[(.*?)\]\s*$/);
    if (match) {
        return {
            name: match[1].trim(),
            mood: match[2].trim(),
            text: normalizeBubbleText(match[3]),
        };
    }

    match = text.match(/^@bubble:([^|\n]+)\|([^|\n]+)\|([^|\n]*)\|\[(.*?)\]\s*$/);
    if (match) {
        return {
            alias: match[1].trim(),
            name: match[2].trim(),
            mood: match[3].trim(),
            text: normalizeBubbleText(match[4]),
        };
    }

    match = text.match(/^@bubble:([^|\n]+)\|([^|\n]+)\|([^|\n]*)\|(.*?)\s*$/);
    if (match) {
        return {
            alias: match[1].trim(),
            name: match[2].trim(),
            mood: match[3].trim(),
            text: normalizeBubbleText(match[4]),
        };
    }

    match = text.match(/^@bubble:([^|\n]+)\|([^|\n]*)\|(.*?)\s*$/);
    if (match) {
        return {
            name: match[1].trim(),
            mood: match[2].trim(),
            text: normalizeBubbleText(match[3]),
        };
    }

    return null;
}

function renderBubbleLineForPrompt(line = '') {
    const parsed = parseBubbleLine(line);
    if (!parsed) {
        return line;
    }

    const mood = parsed.mood ? `（${parsed.mood}）` : '';
    return `${parsed.name}${mood}：“${parsed.text}”`;
}

function extractBubbleDialogue(value = '') {
    const source = stripNonStoryBlocks(decodeHtmlEntities(extractEmbeddedStoryText(stripBridgeMarkup(String(value || '')))));
    const lines = source.split(/\r?\n/);
    const dialogue = [];
    for (const line of lines) {
        const parsed = parseBubbleLine(line);
        if (!parsed || !parsed.text) {
            continue;
        }
        dialogue.push({
            index: dialogue.length,
            name: parsed.name,
            alias: parsed.alias || '',
            mood: parsed.mood || '',
            text: truncateText(parsed.text, 240),
        });
        if (dialogue.length >= 24) {
            break;
        }
    }
    return dialogue;
}

function cleanReplyForImagePrompt(value = '') {
    return extractStoryText(value);
}

function stripDirectiveBoilerplate(value = '') {
    return String(value)
        .replace(/^\s*(prompt|提示词|画面|description|image)\s*[:：]/i, '')
        .trim();
}

function extractImageDirectives(value = '') {
    const directives = [];
    const pattern = /<codex-image\b([^>]*)>([\s\S]*?)<\/codex-image>/gi;
    let match;
    while ((match = pattern.exec(String(value)))) {
        const attrs = parseTagAttributes(match[1]);
        const prompt = stripDirectiveBoilerplate(match[2]);
        if (!prompt) {
            continue;
        }
        directives.push({
            title: attrs.title || attrs.name || `Codex Image ${directives.length + 1}`,
            prompt: truncateText(prompt, 1800),
        });
    }

    const legacyPattern = /\[IMG_GEN\]([\s\S]*?)\[\/IMG_GEN\]/gi;
    while ((match = legacyPattern.exec(String(value)))) {
        const prompt = stripDirectiveBoilerplate(cleanReplyForImagePrompt(match[1]));
        if (!prompt) {
            continue;
        }
        directives.push({
            title: `IMG_GEN ${directives.length + 1}`,
            prompt: truncateText(prompt, 1800),
            source: 'IMG_GEN',
        });
    }

    return directives.slice(0, 6);
}

function extractMediaBlocks(value = '') {
    const blocks = [];
    const pattern = /<codex-ui\b([^>]*)>([\s\S]*?)<\/codex-ui>/gi;
    let match;
    while ((match = pattern.exec(String(value)))) {
        const attrs = parseTagAttributes(match[1]);
        const body = extractHtmlFromBlock(match[2]);
        if (!body) {
            continue;
        }
        const block = {
            title: attrs.title || attrs.name || `Codex UI ${blocks.length + 1}`,
            medium: attrs.medium || attrs.type || '',
            renderAs: 'screenshot',
        };
        if (looksLikeHtml(body)) {
            block.html = truncateText(body, 12000);
        } else {
            block.spec = truncateText(cleanReplyForImagePrompt(body), 1800);
        }
        blocks.push(block);
    }
    return blocks.slice(0, 4);
}

function stripBridgeMarkup(value = '') {
    return stripInlineBridgeImageBlocks(value)
        .replace(/<codex-think\b[^>]*>[\s\S]*?<\/codex-think>/gi, '')
        .replace(/<codex-image\b[^>]*>[\s\S]*?<\/codex-image>/gi, '')
        .replace(/<codex-ui\b[^>]*>[\s\S]*?<\/codex-ui>/gi, '')
        .replace(/\[IMG_GEN\][\s\S]*?\[\/IMG_GEN\]/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function getRecentContext(messageId, maxMessages) {
    const start = Math.max(0, messageId - maxMessages);
    return chat.slice(start, messageId).map((message, index) => ({
        index: start + index,
        role: message.is_user ? 'user' : message.is_system ? 'system' : 'assistant',
        name: message.name || '',
        text: truncateText(cleanReplyForImagePrompt(message.mes || '') || message.mes || '', 1200),
    }));
}

function getMessageElement(messageId) {
    return $(`#chat .mes[mesid="${messageId}"]`);
}

function syncBridgeMessageMediaClasses(messageId) {
    const element = getMessageElement(messageId);
    element.find('.mes_img_container').each(function () {
        const hasBridgeImage = $(this).find('.mes_img').toArray().some(image => isBridgeImageUrl($(image).attr('src') || ''));
        $(this).toggleClass('codex-image-bridge-media-hidden', hasBridgeImage);
    });
}

function syncBridgeMessageInlineClass(messageId) {
    const message = chat[messageId];
    const bridge = message?.extra?.codex_image_bridge;
    const hasInlineImages = Boolean(message?.extra?.codex_image_bridge)
        && (
            (Array.isArray(bridge.inlineImageUrls) && bridge.inlineImageUrls.length > 0)
            || (Array.isArray(bridge.images) && bridge.images.length > 0)
            || String(message.mes || '').includes(inlineImageStartMarker)
        );
    getMessageElement(messageId).toggleClass('codex-image-bridge-has-inline', hasInlineImages);
    syncBridgeMessageMediaClasses(messageId);
}

function syncBridgeMessageInlineClasses() {
    for (let messageId = 0; messageId < chat.length; messageId++) {
        syncBridgeMessageInlineClass(messageId);
    }
}

function hasBridgeResult(message) {
    return message?.extra?.codex_image_bridge?.status === 'succeeded';
}

function hasBridgeJob(message) {
    return Boolean(message?.extra?.codex_image_bridge);
}

function shouldIgnoreMessageForCleanup(message) {
    const cutoff = getSettings().ignoreMessagesBefore;
    if (!cutoff || !message?.send_date) {
        return false;
    }
    const cutoffTime = Date.parse(cutoff);
    const messageTime = Date.parse(message.send_date);
    return Number.isFinite(cutoffTime) && Number.isFinite(messageTime) && messageTime <= cutoffTime;
}

function setStatus(message) {
    $('#codex_image_bridge_status').text(message || '');
    $('#codex_image_bridge_floating_panel .codex-image-bridge-floating-status').text(message || '就绪');
    $('#codex_image_bridge_app .codex-image-bridge-app-status').text(message || '就绪');
}

function notifyError(message) {
    console.warn(`[${extensionName}] ${message}`);
    globalThis.toastr?.warning?.(message, 'Codex Image Bridge');
    setStatus(message);
}

async function buildJob(messageId, type) {
    const settings = getSettings();
    const generationSettings = getGenerationSettings(settings);
    const context = getContext();
    const message = chat[messageId];
    const jobId = makeId().replace(/[^a-zA-Z0-9_.-]/g, '-');
    const rawReplyText = String(message?.mes || '');
    const rawImageDirectives = settings.useWorldbookDirectives ? extractImageDirectives(rawReplyText) : [];
    const rawMediaBlocks = settings.renderMediaBlocks ? extractMediaBlocks(rawReplyText) : [];
    const imageDirectives = settings.fastMode ? rawImageDirectives.slice(0, 3) : rawImageDirectives;
    const mediaBlocks = settings.fastMode ? rawMediaBlocks.slice(0, 1) : rawMediaBlocks;
    const imageCount = imageDirectives.length > 0 ? Math.min(imageDirectives.length, generationSettings.fastMode ? 3 : 6) : chooseImageCount(generationSettings);
    const cleanReplyText = cleanReplyForImagePrompt(rawReplyText) || rawReplyText;
    const replyText = truncateText(cleanReplyText, clampInteger(generationSettings.maxReplyChars, 5000, 500, 20000));
    const storyText = replyText;
    const recentContext = getRecentContext(messageId, clampInteger(generationSettings.contextMessages, 4, 0, 12));
    const bubbleDialogue = extractBubbleDialogue(rawReplyText);
    const [library, memoryIndex] = await Promise.all([
        readCharacterLibrary().catch(error => {
            console.warn(`[${extensionName}] failed to read character library`, error);
            return createEmptyCharacterLibrary();
        }),
        readMemoryIndex().catch(error => {
            console.warn(`[${extensionName}] failed to read visual memory`, error);
            return createEmptyMemoryIndex();
        }),
    ]);
    const base = {
        schema: 'codex-image-bridge.job.v1',
        jobId,
        source: 'sillytavern',
        eventType: type || 'message',
        createdAt: new Date().toISOString(),
        chatId: context.chatId || context.getCurrentChatId?.() || '',
        groupId: context.groupId || '',
        messageId,
        characterName: message?.name || context.name2 || '',
        userName: context.name1 || '',
        imageCount,
        size: generationSettings.size || defaultSettings.size,
        style: generationSettings.style || defaultSettings.style,
        fastMode: !!settings.fastMode,
        replyText,
        storyText,
        recentContext,
        bubbleDialogue,
        imageDirectives,
        mediaBlocks,
    };
    const characterProfiles = findCharacterProfilesForJob(base, library, generationSettings.fastMode ? 2 : 4);
    const characterProfile = characterProfiles[0] || null;
    const matchedCharacterNames = characterProfiles.map(profile => profile.name).filter(Boolean);
    if (matchedCharacterNames.length > 0) {
        base.characterName = matchedCharacterNames.join(' / ');
    }
    const promptPreset = getPromptPreset(settings);
    base.promptPreset = {
        key: settings.promptPreset || defaultSettings.promptPreset,
        label: promptPreset.label,
        text: promptPreset.text,
    };
    base.characterProfileId = characterProfile?.id || '';
    base.characterProfile = compactCharacterProfile(characterProfile, clampInteger(generationSettings.memoryMaxChars, defaultSettings.memoryMaxChars, 120, 2000));
    base.characterProfiles = characterProfiles.map(profile => compactCharacterProfile(profile, clampInteger(generationSettings.memoryMaxChars, defaultSettings.memoryMaxChars, 120, 2000))).filter(Boolean);
    base.characterReferences = getCharacterReferencesForProfiles(characterProfiles, generationSettings);
    base.visualMemory = getRelevantVisualMemory(base, memoryIndex, generationSettings);

    const jobFile = `codex-image-bridge-job-${jobId}.json`;
    const resultFile = `codex-image-bridge-result-${jobId}.json`;
    return {
        ...base,
        jobFile,
        resultFile,
        prompt: renderPromptTemplate(generationSettings.promptTemplate, base),
    };
}

async function uploadJobFile(job) {
    const context = getContext();
    const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            name: job.jobFile,
            data: encodeBase64Utf8(JSON.stringify(job, null, 2)),
        }),
    });

    if (!response.ok) {
        throw new Error(`failed to upload Codex job file: ${response.status} ${await response.text()}`);
    }

    try {
        return await response.json();
    } catch (error) {
        console.warn(`[${extensionName}] result file is not ready yet`, error);
        return null;
    }
}

async function fetchResultFile(resultFile) {
    const response = await fetch(`/user/files/${encodeURIComponent(resultFile)}?t=${Date.now()}`, {
        cache: 'no-store',
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`failed to read Codex result file: ${response.status}`);
    }

    return await response.json();
}

function makeBridgeImageDisplayId(jobId, index) {
    const safeJob = String(jobId || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 8) || 'local';
    const safeIndex = Number.isFinite(Number(index)) && Number(index) > 0 ? Number(index) : 1;
    return `CIB-${safeJob}-${safeIndex}`;
}

function normalizeBridgeImageDisplayId(image = {}, jobId = '', index = 1) {
    return String(image.displayId || image.imageNo || image.imageId || makeBridgeImageDisplayId(jobId, image.index || index)).trim();
}

function normalizeResultImages(result) {
    const jobId = String(result?.jobId || '');
    return Array.isArray(result?.images)
        ? result.images.filter(image => image?.url).map((image, index) => ({
            ...image,
            index: image.index || index + 1,
            displayId: normalizeBridgeImageDisplayId(image, jobId, index + 1),
        }))
        : [];
}

function stripInlineBridgeImageBlocks(value = '') {
    const pattern = new RegExp(`\\n*${inlineImageStartMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${inlineImageEndMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n*`, 'g');
    return String(value || '')
        .replace(pattern, '\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function removeInlineBridgeImagesByUrl(value = '', urls = []) {
    const urlSet = new Set(urls.map(stripLeadingSlash));
    if (urlSet.size === 0) {
        return String(value || '');
    }
    const pattern = new RegExp(`\\n*${inlineImageStartMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${inlineImageEndMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n*`, 'g');
    return String(value || '')
        .replace(pattern, block => {
            const normalizedBlock = stripLeadingSlash(block);
            for (const url of urlSet) {
                if (normalizedBlock.includes(url)) {
                    return '\n\n';
                }
            }
            return block;
        })
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function escapeMarkdownImageAlt(value = '') {
    return String(value || 'Codex Image')
        .replace(/[\]\r\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'Codex Image';
}

function createInlineImageBlock(image) {
    const src = getPublicImageSrc(image.url);
    const displayId = normalizeBridgeImageDisplayId(image, image.jobId, image.index || 1);
    const alt = escapeMarkdownImageAlt(image.title || `Codex Image ${image.index || ''}`);
    return `${inlineImageStartMarker}\n<img class="codex-image-bridge-inline-image" src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}">\n图片编号：${displayId}\n${inlineImageEndMarker}`;
}

function countTagMatches(line, tagName, closing = false) {
    const pattern = closing
        ? new RegExp(`<\\/${tagName}\\s*>`, 'gi')
        : new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
    return (String(line || '').match(pattern) || []).length;
}

function getInlineImageContentIndexes(lines) {
    const hiddenTags = ['thinking', 'ZhaiyaoGeshi', 'codex-think', 'imgthink', 'SearchResults', 'fox_outline', 'fox_memory', 'UpdateVariable', 'Analysis', 'JSONPatch'];
    const hasContentContainer = lines.some(line => /<content\b/i.test(line)) && lines.some(line => /<\/content\s*>/i.test(line));
    const indexes = [];
    let hiddenDepth = 0;
    let contentDepth = 0;

    lines.forEach((line, index) => {
        const hiddenOpens = hiddenTags.reduce((sum, tag) => sum + countTagMatches(line, tag, false), 0);
        const hiddenCloses = hiddenTags.reduce((sum, tag) => sum + countTagMatches(line, tag, true), 0);
        const hiddenForLine = hiddenDepth > 0 || hiddenOpens > 0;
        const contentForLine = !hasContentContainer || contentDepth > 0 || /<content\b/i.test(line);
        const visibleText = String(line || '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<\/?(?:content|now_plot)\b[^>]*>/gi, '')
            .replace(/<\/?(?:thinking|ZhaiyaoGeshi|codex-think|imgthink|SearchResults|fox_outline|fox_memory)\b[^>]*>/gi, '')
            .trim();
        const tagOnly = /^```/.test(visibleText) || /^<\/?[a-z][\w:-]*\b[^>]*>$/i.test(visibleText);

        if (!hiddenForLine && contentForLine && visibleText && !tagOnly) {
            indexes.push(index);
        }

        hiddenDepth = Math.max(0, hiddenDepth + hiddenOpens - hiddenCloses);
        contentDepth = Math.max(0, contentDepth + countTagMatches(line, 'content', false) - countTagMatches(line, 'content', true));
    });

    return indexes;
}

function getInlineImageSlots(lines, count) {
    const contentIndexes = getInlineImageContentIndexes(lines);
    if (contentIndexes.length === 0) {
        return new Array(count).fill(Math.max(0, lines.length - 1));
    }

    const used = new Set();
    return Array.from({ length: count }, (_, imageIndex) => {
        const ratio = (imageIndex + 1) / (count + 1);
        let cursor = Math.min(contentIndexes.length - 1, Math.max(0, Math.round((contentIndexes.length - 1) * ratio)));
        let lineIndex = contentIndexes[cursor];
        while (used.has(lineIndex) && cursor < contentIndexes.length - 1) {
            cursor += 1;
            lineIndex = contentIndexes[cursor];
        }
        used.add(lineIndex);
        return lineIndex;
    });
}

function insertInlineBridgeImages(messageText = '', images = []) {
    const cleanText = stripInlineBridgeImageBlocks(messageText);
    const inlineImages = images.filter(image => image?.url);
    if (inlineImages.length === 0) {
        return cleanText;
    }
    if (!cleanText) {
        return inlineImages.map(createInlineImageBlock).join('\n\n');
    }

    const lines = cleanText.split(/\r?\n/);
    const slots = getInlineImageSlots(lines, inlineImages.length);
    const imagesByLine = new Map();
    inlineImages.forEach((image, index) => {
        const lineIndex = slots[index];
        if (!imagesByLine.has(lineIndex)) {
            imagesByLine.set(lineIndex, []);
        }
        imagesByLine.get(lineIndex).push(image);
    });

    const output = [];
    lines.forEach((line, index) => {
        output.push(line);
        const lineImages = imagesByLine.get(index);
        if (lineImages?.length) {
            output.push('', ...lineImages.map(createInlineImageBlock), '');
        }
    });
    return output.join('\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

function getAttachedBridgeImageUrls(message, jobId) {
    const urls = new Set();
    const bridge = message?.extra?.codex_image_bridge;
    for (const image of Array.isArray(bridge?.images) ? bridge.images : []) {
        if (image?.url) {
            urls.add(stripLeadingSlash(image.url));
        }
    }
    for (const url of Array.isArray(bridge?.inlineImageUrls) ? bridge.inlineImageUrls : []) {
        if (url) {
            urls.add(stripLeadingSlash(url));
        }
    }
    for (const media of Array.isArray(message?.extra?.media) ? message.extra.media : []) {
        if (media?.codex_image_bridge === jobId && media?.url) {
            urls.add(stripLeadingSlash(media.url));
        }
    }
    return urls;
}

function getBridgeStoredImages(message) {
    const bridge = message?.extra?.codex_image_bridge;
    const jobId = bridge?.jobId || '';
    if (Array.isArray(bridge?.images) && bridge.images.length > 0) {
        return bridge.images
            .filter(image => image?.url)
            .map((image, index) => ({
                ...image,
                index: image.index || index + 1,
                displayId: normalizeBridgeImageDisplayId(image, jobId, index + 1),
                title: image.title || `Codex Image ${index + 1}`,
            }));
    }

    if (Array.isArray(bridge?.inlineImageUrls) && bridge.inlineImageUrls.length > 0) {
        return bridge.inlineImageUrls
            .filter(Boolean)
            .map((url, index) => ({
                url: stripLeadingSlash(url),
                index: index + 1,
                displayId: Array.isArray(bridge.inlineImageDisplayIds) && bridge.inlineImageDisplayIds[index]
                    ? bridge.inlineImageDisplayIds[index]
                    : makeBridgeImageDisplayId(jobId, index + 1),
                title: `Codex Image ${index + 1}`,
                kind: 'narrative',
            }));
    }

    return [];
}

function getBridgeMediaImages(message) {
    const jobId = message?.extra?.codex_image_bridge?.jobId || '';
    const storedImages = getBridgeStoredImages(message);
    if (storedImages.length > 0) {
        return storedImages;
    }

    return Array.isArray(message?.extra?.media)
        ? message.extra.media
            .filter(media => media?.url && media?.type === MEDIA_TYPE.IMAGE && (media.codex_image_bridge === jobId || String(media.url).includes(imageFolderName)))
            .map((media, index) => ({
                ...media,
                index: index + 1,
                displayId: normalizeBridgeImageDisplayId(media, jobId, index + 1),
                title: media.title || `Codex Image ${index + 1}`,
            }))
        : [];
}

function removeBridgeMediaAttachments(message, jobId = '') {
    if (!Array.isArray(message?.extra?.media)) {
        return false;
    }

    const before = message.extra.media.length;
    message.extra.media = message.extra.media.filter(media => {
        const url = stripLeadingSlash(media?.url || '');
        return !(isBridgeImageUrl(url) || (jobId && media?.codex_image_bridge === jobId));
    });

    if (message.extra.media.length === before) {
        return false;
    }

    if (message.extra.media.length === 0) {
        delete message.extra.media;
        delete message.extra.media_index;
        delete message.extra.media_display;
    } else {
        message.extra.media_index = Math.min(Math.max(0, message.extra.media_index || 0), Math.max(0, message.extra.media.length - 1));
    }

    return true;
}

async function ensureInlineImagesForBridgeMessages() {
    let changed = false;
    for (let messageId = 0; messageId < chat.length; messageId++) {
        const message = chat[messageId];
        if (!message?.extra?.codex_image_bridge) {
            continue;
        }
        const images = getBridgeMediaImages(message);
        if (images.length === 0) {
            continue;
        }
        const nextMessageText = insertInlineBridgeImages(message.mes, images);
        const removedMedia = removeBridgeMediaAttachments(message, message.extra.codex_image_bridge.jobId);
        if (nextMessageText === message.mes && !removedMedia) {
            continue;
        }
        message.mes = nextMessageText;
        message.extra.codex_image_bridge.images = images.map((image, index) => ({
            ...image,
            index: image.index || index + 1,
            displayId: normalizeBridgeImageDisplayId(image, message.extra.codex_image_bridge.jobId, index + 1),
            url: stripLeadingSlash(image.url),
        }));
        message.extra.codex_image_bridge.inlineImageUrls = images.map(image => stripLeadingSlash(image.url));
        message.extra.codex_image_bridge.inlineImageDisplayIds = images.map(image => image.displayId).filter(Boolean);
        updateMessageBlock(messageId, message);
        syncBridgeMessageInlineClass(messageId);
        changed = true;
    }
    if (changed) {
        await saveChatConditional();
    }
}

async function readUserJsonFile(fileName, fallbackFactory) {
    const response = await fetch(`/user/files/${encodeURIComponent(fileName)}?t=${Date.now()}`, {
        cache: 'no-store',
    });

    if (response.status === 404) {
        return fallbackFactory();
    }
    if (!response.ok) {
        throw new Error(`failed to read ${fileName}: ${response.status}`);
    }

    try {
        return await response.json();
    } catch (error) {
        console.warn(`[${extensionName}] invalid JSON in ${fileName}`, error);
        return fallbackFactory();
    }
}

async function saveUserJsonFile(fileName, data) {
    const context = getContext();
    const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            name: fileName,
            data: encodeBase64Utf8(JSON.stringify(data, null, 2)),
        }),
    });

    if (!response.ok) {
        throw new Error(`failed to save ${fileName}: ${response.status} ${await response.text()}`);
    }

    return await response.json();
}

function getAutomationActiveMinutes(settings = getSettings()) {
    return clampInteger(settings.automationActiveMinutes, defaultSettings.automationActiveMinutes, 1, 1440);
}

async function writeActivityState(reason = 'activity', extra = {}) {
    const settings = getSettings();
    const context = getContext();
    const now = new Date();
    const activityWindowMinutes = getAutomationActiveMinutes(settings);
    const activeUntil = settings.enabled
        ? new Date(now.getTime() + activityWindowMinutes * 60 * 1000).toISOString()
        : now.toISOString();

    const state = {
        schema: stateSchema,
        enabled: !!settings.enabled,
        updatedAt: now.toISOString(),
        lastActivityAt: now.toISOString(),
        activeUntil,
        reason,
        activityWindowMinutes,
        currentChatId: context.chatId || context.getCurrentChatId?.() || '',
        groupId: context.groupId || '',
        characterName: context.name2 || '',
        userName: context.name1 || '',
        resultPollMs: clampInteger(settings.resultPollMs, defaultSettings.resultPollMs, 2000, 300000),
        imageCountRange: {
            min: clampInteger(settings.minImages, defaultSettings.minImages, 1, 6),
            max: clampInteger(settings.maxImages, defaultSettings.maxImages, 1, 6),
        },
        heartbeatPolicy: {
            processOnlyIfPendingJobExists: true,
            maxJobsPerWake: 1,
            staleJobMinutes: 1440,
        },
        ...extra,
    };

    await saveUserJsonFile(stateFileName, state);
    return state;
}

function markActivityState(reason = 'activity', extra = {}) {
    writeActivityState(reason, extra).catch(error => {
        console.warn(`[${extensionName}] failed to write activity state`, error);
    });
}

function scheduleActivityState(reason = 'activity', extra = {}, delayMs = 750) {
    if (activityStateTimer) {
        clearTimeout(activityStateTimer);
    }
    activityStateTimer = setTimeout(() => {
        activityStateTimer = null;
        markActivityState(reason, extra);
    }, delayMs);
}

function createEmptyCache() {
    return {
        schema: cacheSchema,
        updatedAt: new Date().toISOString(),
        images: [],
    };
}

function stripLeadingSlash(value) {
    return String(value || '').trim().replace(/^\/+/, '');
}

function isInlineImageUrl(value) {
    return /^(data|blob):/i.test(String(value || '').trim());
}

function getPublicImageSrc(url) {
    const text = String(url || '').trim();
    if (!text || /^https?:\/\//i.test(text) || text.startsWith('/') || isInlineImageUrl(text)) {
        return text;
    }
    return `/${text}`;
}

function getImageFileName(url) {
    if (isInlineImageUrl(url)) {
        const mime = String(url || '').match(/^data:([^;]+);/i)?.[1] || 'inline image';
        return mime;
    }
    const cleanUrl = stripLeadingSlash(url).split(/[?#]/)[0];
    const fileName = cleanUrl.split('/').filter(Boolean).pop() || '';
    try {
        return decodeURIComponent(fileName);
    } catch {
        return fileName;
    }
}

function cleanCacheId(value) {
    const id = String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/-+/g, '-').slice(0, 180);
    return id || makeId().replace(/[^a-zA-Z0-9_.-]/g, '-');
}

function makeTextHash(value) {
    let hash = 0;
    const text = String(value || '');
    for (let index = 0; index < text.length; index++) {
        hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
}

function cleanCharacterId(value) {
    const source = String(value || '').trim();
    const cleaned = cleanCacheId(source);
    if (!source || cleaned === source) {
        return cleaned;
    }
    return `${cleaned}-${makeTextHash(source)}`.replace(/-+/g, '-').slice(0, 180);
}

function normalizeOptionalInteger(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const number = Number(value);
    return Number.isInteger(number) ? number : null;
}

function isBridgeImageUrl(url) {
    return stripLeadingSlash(url).startsWith(`user/images/${imageFolderName}/`);
}

function makeCacheId(url, jobId, index) {
    return cleanCacheId(`${jobId || 'image'}-${index || ''}-${getImageFileName(url) || stripLeadingSlash(url)}`);
}

function normalizeCacheImage(image = {}, fallback = {}) {
    const url = stripLeadingSlash(image.url || fallback.url);
    if (!url) {
        return null;
    }

    const jobId = String(image.jobId || fallback.jobId || '');
    const index = image.index ?? fallback.index ?? '';
    const fileName = String(image.fileName || fallback.fileName || getImageFileName(url));
    const createdAt = String(image.createdAt || fallback.createdAt || new Date().toISOString());
    const id = cleanCacheId(image.id || fallback.id || makeCacheId(url, jobId, index));
    const displayId = normalizeBridgeImageDisplayId({ ...fallback, ...image }, jobId, index || 1);

    return {
        id,
        displayId,
        url,
        title: String(image.title || fallback.title || displayId || fileName || 'Codex Image'),
        prompt: String(image.prompt || fallback.prompt || ''),
        jobId,
        chatId: String(image.chatId || fallback.chatId || ''),
        groupId: String(image.groupId || fallback.groupId || ''),
        messageId: normalizeOptionalInteger(image.messageId ?? fallback.messageId),
        characterName: String(image.characterName || fallback.characterName || ''),
        userName: String(image.userName || fallback.userName || ''),
        fileName,
        kind: String(image.kind || fallback.kind || 'narrative'),
        source: String(image.source || fallback.source || extensionName),
        size: String(image.size || fallback.size || ''),
        style: String(image.style || fallback.style || ''),
        createdAt,
        completedAt: String(image.completedAt || fallback.completedAt || createdAt),
    };
}

function compareCacheImages(a, b) {
    const bTime = Date.parse(b.createdAt || '') || 0;
    const aTime = Date.parse(a.createdAt || '') || 0;
    return bTime - aTime || String(b.fileName || b.url).localeCompare(String(a.fileName || a.url));
}

function dedupeCacheImages(images) {
    const seenUrls = new Set();
    const seenDisplayIds = new Set();
    const deduped = [];

    for (const image of images || []) {
        const entry = normalizeCacheImage(image);
        const stableDisplayId = entry?.displayId && !entry.displayId.startsWith('CIB-local-') ? entry.displayId : '';
        if (!entry || seenUrls.has(entry.url) || (stableDisplayId && seenDisplayIds.has(stableDisplayId))) {
            continue;
        }
        seenUrls.add(entry.url);
        if (stableDisplayId) {
            seenDisplayIds.add(stableDisplayId);
        }
        deduped.push(entry);
    }

    return deduped.sort(compareCacheImages);
}

async function readCacheIndex() {
    const response = await fetch(`/user/files/${encodeURIComponent(cacheFileName)}?t=${Date.now()}`, {
        cache: 'no-store',
    });

    if (response.status === 404) {
        return createEmptyCache();
    }
    if (!response.ok) {
        throw new Error(`failed to read Codex image cache: ${response.status}`);
    }

    try {
        const data = await response.json();
        return {
            ...createEmptyCache(),
            ...data,
            images: dedupeCacheImages(Array.isArray(data.images) ? data.images : []),
        };
    } catch (error) {
        console.warn(`[${extensionName}] invalid cache index`, error);
        return createEmptyCache();
    }
}

async function saveCacheIndex(images = cacheImages) {
    const context = getContext();
    const cache = {
        schema: cacheSchema,
        updatedAt: new Date().toISOString(),
        images: dedupeCacheImages(images),
    };
    const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            name: cacheFileName,
            data: encodeBase64Utf8(JSON.stringify(cache, null, 2)),
        }),
    });

    if (!response.ok) {
        throw new Error(`failed to save Codex image cache: ${response.status} ${await response.text()}`);
    }

    return cache;
}

async function fetchServerImageNames() {
    const context = getContext();
    const response = await fetch('/api/images/list', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            folder: imageFolderName,
            sortField: 'date',
            sortOrder: 'desc',
        }),
    });

    if (!response.ok) {
        throw new Error(`failed to list Codex images: ${response.status} ${await response.text()}`);
    }

    const names = await response.json();
    return Array.isArray(names) ? names.filter(name => typeof name === 'string') : [];
}

async function syncCacheWithServerImages(images) {
    const names = await fetchServerImageNames();
    const serverUrls = names.map(name => `user/images/${imageFolderName}/${name}`);
    const serverUrlSet = new Set(serverUrls);
    let changed = false;

    const merged = dedupeCacheImages(images).filter(entry => {
        const keep = !isBridgeImageUrl(entry.url) || serverUrlSet.has(entry.url);
        if (!keep) {
            changed = true;
        }
        return keep;
    });
    const existingUrls = new Set(merged.map(entry => entry.url));

    for (const [index, url] of serverUrls.entries()) {
        if (existingUrls.has(url)) {
            continue;
        }
        merged.push(normalizeCacheImage({
            url,
            title: getImageFileName(url),
            source: 'server-sync',
            createdAt: new Date(Date.now() - index).toISOString(),
        }));
        changed = true;
    }

    return {
        images: dedupeCacheImages(merged),
        changed,
    };
}

function createEmptyCharacterLibrary() {
    return {
        schema: characterSchema,
        updatedAt: new Date().toISOString(),
        characters: [],
    };
}

function createEmptyOutfitLibrary() {
    return {
        schema: outfitSchema,
        updatedAt: new Date().toISOString(),
        outfits: [],
    };
}

function createEmptyAssetLibrary() {
    return {
        schema: assetSchema,
        updatedAt: new Date().toISOString(),
        items: [],
    };
}

function createEmptyMemoryIndex() {
    return {
        schema: memorySchema,
        updatedAt: new Date().toISOString(),
        memories: [],
    };
}

function splitLines(value) {
    return String(value || '').split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
}

function splitReferenceLines(value) {
    return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function uniqueCleanList(items) {
    const seen = new Set();
    const result = [];
    for (const item of items || []) {
        const text = String(item || '').trim();
        if (!text || seen.has(text)) {
            continue;
        }
        seen.add(text);
        result.push(text);
    }
    return result;
}

function normalizeReferenceList(value) {
    const references = Array.isArray(value) ? value : splitReferenceLines(value);
    return uniqueCleanList(references.map(item => isInlineImageUrl(item) ? item : stripLeadingSlash(item))).slice(0, 24);
}

function normalizeName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeCharacterProfile(profile = {}) {
    const name = String(profile.name || '').trim();
    if (!name) {
        return null;
    }

    const aliases = Array.isArray(profile.aliases) ? profile.aliases : splitLines(profile.aliases);

    return {
        id: cleanCharacterId(profile.id || name),
        name,
        aliases: uniqueCleanList(aliases.map(String)),
        appearance: String(profile.appearance || '').trim(),
        outfit: String(profile.outfit || '').trim(),
        personality: String(profile.personality || '').trim(),
        negative: String(profile.negative || '').trim(),
        photoPrompt: String(profile.photoPrompt || '').trim(),
        sendPhoto: String(profile.sendPhoto || '').trim(),
        notes: String(profile.notes || '').trim(),
        references: normalizeReferenceList(profile.references),
        createdAt: String(profile.createdAt || new Date().toISOString()),
        updatedAt: String(profile.updatedAt || new Date().toISOString()),
    };
}

function normalizeCharacterLibrary(data) {
    return {
        ...createEmptyCharacterLibrary(),
        ...data,
        characters: (Array.isArray(data?.characters) ? data.characters : []).map(normalizeCharacterProfile).filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name)),
    };
}

function normalizeOutfitProfile(profile = {}) {
    const name = String(profile.name || '').trim();
    if (!name) {
        return null;
    }

    return {
        id: cleanCharacterId(profile.id || `outfit-${name}`),
        name,
        characterName: String(profile.characterName || '').trim(),
        tags: uniqueCleanList(Array.isArray(profile.tags) ? profile.tags : splitLines(profile.tags)).slice(0, 24),
        prompt: String(profile.prompt || profile.description || '').trim(),
        negative: String(profile.negative || '').trim(),
        references: normalizeReferenceList(profile.references),
        notes: String(profile.notes || '').trim(),
        createdAt: String(profile.createdAt || new Date().toISOString()),
        updatedAt: String(profile.updatedAt || new Date().toISOString()),
    };
}

function normalizeOutfitLibrary(data) {
    return {
        ...createEmptyOutfitLibrary(),
        ...data,
        outfits: (Array.isArray(data?.outfits) ? data.outfits : []).map(normalizeOutfitProfile).filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name)),
    };
}

function normalizeAssetItem(item = {}) {
    const name = String(item.name || '').trim();
    if (!name) {
        return null;
    }

    return {
        id: cleanCharacterId(item.id || `asset-${name}`),
        name,
        type: String(item.type || '其他').trim(),
        tags: uniqueCleanList(Array.isArray(item.tags) ? item.tags : splitLines(item.tags)).slice(0, 24),
        prompt: String(item.prompt || item.description || '').trim(),
        references: normalizeReferenceList(item.references),
        notes: String(item.notes || '').trim(),
        createdAt: String(item.createdAt || new Date().toISOString()),
        updatedAt: String(item.updatedAt || new Date().toISOString()),
    };
}

function normalizeAssetLibrary(data) {
    return {
        ...createEmptyAssetLibrary(),
        ...data,
        items: (Array.isArray(data?.items) ? data.items : []).map(normalizeAssetItem).filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name)),
    };
}

async function readCharacterLibrary() {
    const rawData = await readUserJsonFile(characterFileName, createEmptyCharacterLibrary);
    const data = await migrateLegacyExternalReferenceImages(rawData);
    characterLibrary = normalizeCharacterLibrary(data);
    return characterLibrary;
}

async function saveCharacterLibrary(library = characterLibrary || createEmptyCharacterLibrary()) {
    characterLibrary = normalizeCharacterLibrary({
        ...library,
        updatedAt: new Date().toISOString(),
    });
    await saveUserJsonFile(characterFileName, characterLibrary);
    renderCharacterLibrary();
    return characterLibrary;
}

async function migrateLegacyExternalReferenceImages(data = createEmptyCharacterLibrary()) {
    const characters = Array.isArray(data?.characters) ? data.characters : [];
    const targets = characters.filter(profile => {
        const legacyIds = Array.isArray(profile?.sourcePhotoImageIds)
            ? profile.sourcePhotoImageIds
            : splitLines(profile?.sourcePhotoImageIds);
        return legacyIds.length > 0;
    });

    if (targets.length === 0 || legacyReferenceMigrationAttempted) {
        return data;
    }
    legacyReferenceMigrationAttempted = true;

    let getConfigImage;
    try {
        ({ getConfigImage } = await import('/scripts/extensions/third-party/st-chatu8/utils/configDatabase.js'));
    } catch (error) {
        console.warn(`[${extensionName}] legacy reference image migration skipped`, error);
        return data;
    }
    if (typeof getConfigImage !== 'function') {
        return data;
    }

    let imported = 0;
    const migratedCharacters = [];
    for (const profile of characters) {
        const legacyIds = Array.isArray(profile?.sourcePhotoImageIds)
            ? profile.sourcePhotoImageIds
            : splitLines(profile?.sourcePhotoImageIds);
        if (legacyIds.length === 0) {
            migratedCharacters.push(profile);
            continue;
        }

        let importedForProfile = 0;
        const references = new Set(normalizeReferenceList(profile.references));
        for (let index = 0; index < legacyIds.length; index++) {
            const imageId = String(legacyIds[index] || '').trim();
            if (!imageId) {
                continue;
            }
            const cleanImageId = cleanCacheId(imageId);
            if (Array.from(references).some(url => String(url || '').includes(cleanImageId))) {
                continue;
            }
            try {
                const dataUrl = await getConfigImage(imageId);
                if (!dataUrl || !String(dataUrl).startsWith('data:')) {
                    continue;
                }
                const savedPath = await saveReferenceImageDataUrl(dataUrl, `${profile.id || profile.name}-${index}-${cleanImageId}`, profile.name);
                references.add(savedPath);
                imported++;
                importedForProfile++;
            } catch (error) {
                console.warn(`[${extensionName}] failed to migrate legacy reference image ${imageId}`, error);
            }
        }

        if (importedForProfile > 0) {
            const { source, sourceId, sourcePhotoImageIds, ...cleanProfile } = profile;
            migratedCharacters.push({
                ...cleanProfile,
                references: Array.from(references),
                updatedAt: new Date().toISOString(),
            });
        } else {
            migratedCharacters.push(profile);
        }
    }

    if (imported === 0) {
        return data;
    }

    const migrated = {
        ...data,
        characters: migratedCharacters,
        updatedAt: new Date().toISOString(),
    };
    await saveUserJsonFile(characterFileName, migrated);
    setStatus(`已转存 ${imported} 张旧参考图到 Bridge`);
    return migrated;
}

async function readOutfitLibrary() {
    const data = await readUserJsonFile(outfitFileName, createEmptyOutfitLibrary);
    outfitLibrary = normalizeOutfitLibrary(data);
    return outfitLibrary;
}

async function saveOutfitLibrary(library = outfitLibrary || createEmptyOutfitLibrary()) {
    outfitLibrary = normalizeOutfitLibrary({
        ...library,
        updatedAt: new Date().toISOString(),
    });
    await saveUserJsonFile(outfitFileName, outfitLibrary);
    renderBridgeApp();
    return outfitLibrary;
}

async function readAssetLibrary() {
    const data = await readUserJsonFile(assetFileName, createEmptyAssetLibrary);
    assetLibrary = normalizeAssetLibrary(data);
    return assetLibrary;
}

async function saveAssetLibrary(library = assetLibrary || createEmptyAssetLibrary()) {
    assetLibrary = normalizeAssetLibrary({
        ...library,
        updatedAt: new Date().toISOString(),
    });
    await saveUserJsonFile(assetFileName, assetLibrary);
    renderBridgeApp();
    return assetLibrary;
}

function findCharacterProfile(name, library = characterLibrary) {
    const needle = normalizeName(name);
    if (!needle || !Array.isArray(library?.characters)) {
        return null;
    }

    return library.characters.find(profile => {
        const names = [profile.name, ...(profile.aliases || [])].map(normalizeName);
        return names.includes(needle) || names.some(alias => alias && needle.includes(alias));
    }) || null;
}

function getCharacterProfileNames(profile) {
    return [profile?.name, ...(profile?.aliases || [])]
        .map(name => String(name || '').trim())
        .filter(Boolean);
}

function getCharacterMentionScore(profile, text = '') {
    const haystack = normalizeName(text);
    if (!haystack) {
        return 0;
    }

    let score = 0;
    for (const name of getCharacterProfileNames(profile)) {
        const needle = normalizeName(name);
        if (!needle) {
            continue;
        }
        if (haystack === needle) {
            score += 100;
        } else if (haystack.includes(needle)) {
            score += Math.max(10, needle.length);
        }
    }
    return score;
}

function buildCharacterMatchText(base = {}) {
    const contextText = Array.isArray(base.recentContext)
        ? base.recentContext.map(item => `${item.name || ''} ${item.text || ''}`).join('\n')
        : String(base.recentContext || '');
    const bubbleText = Array.isArray(base.bubbleDialogue)
        ? base.bubbleDialogue.map(item => `${item.speaker || item.name || item.alias || ''} ${item.emotion || item.mood || ''} ${item.text || ''}`).join('\n')
        : String(base.bubbleDialogue || '');
    return [
        base.storyText || base.replyText,
        contextText,
        bubbleText,
        base.characterName,
    ].join('\n');
}

function extractStoryCharacterHints(base = {}) {
    const hints = [];
    const addHint = value => {
        const text = String(value || '').trim();
        if (text && !hints.includes(text)) {
            hints.push(text);
        }
    };

    if (Array.isArray(base.bubbleDialogue)) {
        for (const item of base.bubbleDialogue) {
            addHint(item?.speaker || item?.name || item?.alias);
        }
        if (hints.length > 0) {
            return hints;
        }
    }

    const text = [base.storyText || base.replyText, base.prompt].map(value => String(value || '')).join('\n');
    const pattern = /(?:当前)?人物[：:]\s*([^\n。；;]+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        for (const part of match[1].split(/[、,，/和与\s]+/)) {
            const name = part.trim().replace(/^[\[\]()（）]+|[\[\]()（）]+$/g, '');
            if (name.length > 1 && name.length <= 24) {
                addHint(name);
            }
        }
    }
    return hints;
}

function characterProfileMatchesHints(profile, hints = []) {
    if (!hints.length) {
        return true;
    }
    const names = getCharacterProfileNames(profile).map(normalizeName).filter(Boolean);
    const needles = hints.map(normalizeName).filter(Boolean);
    return names.some(name => needles.some(needle => name === needle || name.includes(needle) || needle.includes(name)));
}

function findCharacterProfilesForJob(base, library = characterLibrary, maxProfiles = 4) {
    const characters = Array.isArray(library?.characters) ? library.characters : [];
    if (characters.length === 0) {
        return [];
    }

    const profiles = [];
    const seen = new Set();
    const hints = extractStoryCharacterHints(base);
    if (hints.length > 0) {
        for (const hint of hints) {
            const hinted = findCharacterProfile(hint, library);
            if (hinted && !seen.has(hinted.id)) {
                profiles.push(hinted);
                seen.add(hinted.id);
                if (profiles.length >= maxProfiles) {
                    return profiles;
                }
            }
        }
    } else {
        const direct = findCharacterProfile(base.characterName, library);
        if (direct) {
            profiles.push(direct);
            seen.add(direct.id);
        }
    }

    const text = buildCharacterMatchText(base);
    const scored = characters
        .filter(profile => !seen.has(profile.id))
        .filter(profile => characterProfileMatchesHints(profile, hints))
        .map(profile => ({ profile, score: getCharacterMentionScore(profile, text) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.profile.name.localeCompare(b.profile.name));

    for (const item of scored) {
        profiles.push(item.profile);
        seen.add(item.profile.id);
        if (profiles.length >= maxProfiles) {
            break;
        }
    }

    return profiles;
}

function compactCharacterProfile(profile, maxChars) {
    if (!profile) {
        return null;
    }

    return {
        name: profile.name,
        aliases: profile.aliases || [],
        appearance: truncateText(profile.appearance, maxChars),
        outfit: truncateText(profile.outfit, maxChars),
        personality: truncateText(profile.personality, Math.floor(maxChars / 2)),
        negative: truncateText(profile.negative, Math.floor(maxChars / 2)),
        photoPrompt: truncateText(profile.photoPrompt, Math.floor(maxChars / 2)),
        notes: truncateText(profile.notes, Math.floor(maxChars / 2)),
        referenceImageCount: profile.references?.length || 0,
    };
}

function getCharacterReferences(profile, settings) {
    if (!profile) {
        return [];
    }

    const maxReferences = clampInteger(settings.characterReferenceCount, defaultSettings.characterReferenceCount, 0, 6);
    return (profile.references || []).slice(0, maxReferences).map((url, index) => ({
        index: index + 1,
        characterName: profile.name || '',
        profileId: profile.id || '',
        role: 'character_identity_only',
        usage: 'Use only for face shape, facial proportions, eyes, mouth/smile, age impression, body type, posture tendency, hairstyle, and stable temperament. Do not copy clothing, jewelry, props, background, lighting, exact pose, or accessories.',
        url: isInlineImageUrl(url) ? '' : url,
        inlineImage: isInlineImageUrl(url),
        title: getImageFileName(url),
        localPathHint: isInlineImageUrl(url) ? 'inline reference image saved in character library' : stripLeadingSlash(url),
    }));
}

function getCharacterReferencesForProfiles(profiles = [], settings) {
    const maxReferences = clampInteger(settings.characterReferenceCount, defaultSettings.characterReferenceCount, 0, 6);
    if (maxReferences <= 0 || profiles.length === 0) {
        return [];
    }

    const references = [];
    const seen = new Set();
    for (const profile of profiles) {
        for (const reference of getCharacterReferences(profile, { ...settings, characterReferenceCount: Math.max(1, maxReferences) })) {
            const key = stripLeadingSlash(reference.url || reference.localPathHint || '');
            if (!key || seen.has(key)) {
                continue;
            }
            seen.add(key);
            references.push({
                ...reference,
                index: references.length + 1,
            });
            if (references.length >= maxReferences) {
                return references;
            }
        }
    }
    return references;
}

function normalizeMemoryEntry(entry = {}, fallback = {}) {
    const summary = truncateText(entry.summary || fallback.summary || '', 1200);
    if (!summary && !entry.location && !entry.scene && !entry.characterState) {
        return null;
    }

    return {
        id: cleanCacheId(entry.id || fallback.id || `${entry.jobId || fallback.jobId || makeId()}-memory`),
        jobId: String(entry.jobId || fallback.jobId || ''),
        chatId: String(entry.chatId || fallback.chatId || ''),
        groupId: String(entry.groupId || fallback.groupId || ''),
        characterName: String(entry.characterName || fallback.characterName || ''),
        messageId: normalizeOptionalInteger(entry.messageId ?? fallback.messageId),
        createdAt: String(entry.createdAt || fallback.createdAt || new Date().toISOString()),
        summary,
        location: truncateText(entry.location || fallback.location || '', 180),
        scene: truncateText(entry.scene || fallback.scene || '', 260),
        outfit: truncateText(entry.outfit || fallback.outfit || '', 220),
        characterState: truncateText(entry.characterState || fallback.characterState || '', 260),
        continuityNotes: truncateText(entry.continuityNotes || fallback.continuityNotes || '', 320),
        imageUrls: Array.isArray(entry.imageUrls) ? entry.imageUrls.map(stripLeadingSlash).filter(Boolean).slice(0, 3) : [],
    };
}

function compareMemoryEntries(a, b) {
    return (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
}

function normalizeMemoryIndex(data, limit = defaultSettings.memoryEntries) {
    const seen = new Set();
    const memories = [];

    for (const raw of Array.isArray(data?.memories) ? data.memories : []) {
        const entry = normalizeMemoryEntry(raw);
        if (!entry || seen.has(entry.id)) {
            continue;
        }
        seen.add(entry.id);
        memories.push(entry);
    }

    return {
        ...createEmptyMemoryIndex(),
        ...data,
        memories: memories.sort(compareMemoryEntries).slice(0, limit),
    };
}

async function readMemoryIndex() {
    const settings = getSettings();
    const limit = clampInteger(settings.memoryEntries, defaultSettings.memoryEntries, 1, 200);
    const data = await readUserJsonFile(memoryFileName, createEmptyMemoryIndex);
    return normalizeMemoryIndex(data, limit);
}

async function saveMemoryIndex(index) {
    const settings = getSettings();
    const limit = clampInteger(settings.memoryEntries, defaultSettings.memoryEntries, 1, 200);
    const memoryIndex = normalizeMemoryIndex({
        ...index,
        updatedAt: new Date().toISOString(),
    }, limit);
    await saveUserJsonFile(memoryFileName, memoryIndex);
    return memoryIndex;
}

function getRelevantVisualMemory(base, memoryIndex, settings) {
    const maxItems = clampInteger(settings.memoryItems, defaultSettings.memoryItems, 0, 12);
    const maxChars = clampInteger(settings.memoryMaxChars, defaultSettings.memoryMaxChars, 120, 2000);
    if (maxItems <= 0) {
        return [];
    }

    const characterNeedles = uniqueCleanList([
        base.characterName,
        ...(Array.isArray(base.characterProfiles) ? base.characterProfiles.map(profile => profile?.name) : []),
    ].flatMap(name => String(name || '').split('/'))).map(normalizeName).filter(Boolean);
    const chatNeedle = String(base.chatId || '');
    return (memoryIndex.memories || []).filter(entry => {
        const sameChat = !chatNeedle || !entry.chatId || entry.chatId === chatNeedle;
        const entryName = normalizeName(entry.characterName);
        const sameCharacter = characterNeedles.length === 0
            || !entryName
            || characterNeedles.some(needle => entryName === needle || entryName.includes(needle) || needle.includes(entryName));
        return sameChat && sameCharacter;
    }).slice(0, maxItems).map(entry => ({
        createdAt: entry.createdAt,
        location: entry.location,
        scene: entry.scene,
        outfit: entry.outfit,
        characterState: entry.characterState,
        continuityNotes: entry.continuityNotes,
        summary: truncateText(entry.summary, maxChars),
        imageUrls: entry.imageUrls,
    }));
}

function makeFallbackSceneMemory(messageId, result, bridgeState) {
    const images = Array.isArray(result.images) ? result.images : [];
    const prompt = images.map(image => image?.prompt).filter(Boolean)[0] || '';
    const message = chat[messageId];
    return {
        summary: truncateText(result.sceneSummary || prompt || message?.mes || '', getSettings().memoryMaxChars),
        location: result.location || '',
        scene: result.scene || '',
        outfit: result.outfit || '',
        characterState: result.characterState || '',
        continuityNotes: result.continuityNotes || '',
        imageUrls: images.map(image => image?.url).filter(Boolean).slice(0, 3),
        createdAt: result.createdAt || new Date().toISOString(),
        jobId: bridgeState.jobId,
        chatId: bridgeState.chatId,
        groupId: bridgeState.groupId,
        characterName: bridgeState.characterName || message?.name || '',
        messageId,
    };
}

async function updateVisualMemory(messageId, result, bridgeState) {
    const source = result.sceneMemory && typeof result.sceneMemory === 'object'
        ? {
            ...result.sceneMemory,
            imageUrls: result.sceneMemory.imageUrls || result.images?.map(image => image?.url).filter(Boolean).slice(0, 3),
        }
        : makeFallbackSceneMemory(messageId, result, bridgeState);
    const entry = normalizeMemoryEntry(source, makeFallbackSceneMemory(messageId, result, bridgeState));
    if (!entry) {
        return;
    }

    const index = await readMemoryIndex();
    await saveMemoryIndex({
        ...index,
        memories: [entry, ...index.memories.filter(item => item.id !== entry.id)],
    });
}

function getPromptPreset(settings = getSettings()) {
    const key = settings.promptPreset || defaultSettings.promptPreset;
    return promptPresets[key] || promptPresets[defaultSettings.promptPreset];
}

function getCurrentCharacterName() {
    const context = getContext();
    return context.name2 || chat.findLast?.(message => message && !message.is_user && !message.is_system)?.name || '';
}

function writeCharacterForm(profile = {}) {
    selectedCharacterId = profile.id || '';
    $('#codex_image_bridge_character_name').val(profile.name || getCurrentCharacterName());
    $('#codex_image_bridge_character_aliases').val((profile.aliases || []).join('\n'));
    $('#codex_image_bridge_character_appearance').val(profile.appearance || '');
    $('#codex_image_bridge_character_outfit').val(profile.outfit || '');
    $('#codex_image_bridge_character_personality').val(profile.personality || '');
    $('#codex_image_bridge_character_negative').val(profile.negative || '');
    $('#codex_image_bridge_character_references').val((profile.references || []).join('\n'));
    renderCharacterReferencePreview();
    renderCharacterLibrary();
}

function readCharacterForm() {
    const existing = characterLibrary?.characters?.find(profile => profile.id === selectedCharacterId) || {};
    return normalizeCharacterProfile({
        ...existing,
        id: selectedCharacterId || $('#codex_image_bridge_character_name').val(),
        name: $('#codex_image_bridge_character_name').val(),
        aliases: splitLines($('#codex_image_bridge_character_aliases').val()),
        appearance: $('#codex_image_bridge_character_appearance').val(),
        outfit: $('#codex_image_bridge_character_outfit').val(),
        personality: $('#codex_image_bridge_character_personality').val(),
        negative: $('#codex_image_bridge_character_negative').val(),
        references: splitReferenceLines($('#codex_image_bridge_character_references').val()),
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
    });
}

async function saveCharacterFromForm() {
    const profile = readCharacterForm();
    if (!profile) {
        notifyError('角色名称不能为空');
        return;
    }

    const library = characterLibrary || await readCharacterLibrary();
    const characters = library.characters.filter(item => item.id !== profile.id && normalizeName(item.name) !== normalizeName(profile.name));
    characters.push(profile);
    selectedCharacterId = profile.id;
    await saveCharacterLibrary({ ...library, characters });
    writeCharacterForm(profile);
    setStatus(`已保存角色: ${profile.name}`);
}

async function deleteSelectedCharacter() {
    if (!selectedCharacterId) {
        globalThis.toastr?.info?.('请选择角色', 'Codex Image Bridge');
        return;
    }
    const library = characterLibrary || await readCharacterLibrary();
    const profile = library.characters.find(item => item.id === selectedCharacterId);
    const confirmed = typeof globalThis.confirm === 'function'
        ? globalThis.confirm(`确认删除角色 ${profile?.name || selectedCharacterId}？`)
        : true;
    if (!confirmed) {
        return;
    }

    await saveCharacterLibrary({
        ...library,
        characters: library.characters.filter(item => item.id !== selectedCharacterId),
    });
    selectedCharacterId = '';
    writeCharacterForm({ name: getCurrentCharacterName() });
    setStatus('已删除角色');
}

function addSelectedCacheImagesToCharacter() {
    const entries = getSelectedCacheEntries();
    if (entries.length === 0) {
        globalThis.toastr?.info?.('先在图片缓存里选择参考图', 'Codex Image Bridge');
        return;
    }

    const current = new Set(splitReferenceLines($('#codex_image_bridge_character_references').val()));
    for (const entry of entries) {
        current.add(entry.url);
    }
    $('#codex_image_bridge_character_references').val(Array.from(current).join('\n'));
    renderCharacterReferencePreview();
    setStatus(`已加入 ${entries.length} 张参考图到角色表单`);
}

function getUploadImageFormat(fileName = '', mimeType = '') {
    const fromName = String(fileName || '').split('.').pop()?.toLowerCase() || '';
    const fromMime = String(mimeType || '').split('/').pop()?.toLowerCase() || '';
    const format = fromName || fromMime || 'png';
    return format === 'jpeg' ? 'jpg' : format;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('无法读取图片文件'));
        reader.readAsDataURL(file);
    });
}

async function saveReferenceImageDataUrl(dataUrl, fileName, characterName) {
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,([\s\S]+)$/i);
    if (!match) {
        throw new Error('参考图不是有效的 base64 图片');
    }

    const context = getContext();
    const mime = match[1];
    const format = getUploadImageFormat(fileName, mime);
    const safeName = cleanCacheId(fileName || `${characterName || 'character'}-${Date.now()}`);
    const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            image: match[2],
            format,
            ch_name: imageFolderName,
            filename: safeName,
        }),
    });
    if (!response.ok) {
        throw new Error(`参考图上传失败: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return stripLeadingSlash(data.path || '');
}

function appendReferenceUrlsToForm(urls) {
    const current = new Set(splitReferenceLines($('#codex_image_bridge_character_references').val()));
    for (const url of urls) {
        if (url) {
            current.add(stripLeadingSlash(url));
        }
    }
    $('#codex_image_bridge_character_references').val(Array.from(current).join('\n'));
    renderCharacterReferencePreview();
}

async function uploadCharacterReferenceFiles(files) {
    const list = Array.from(files || []).filter(file => file?.type?.startsWith('image/'));
    if (list.length === 0) {
        globalThis.toastr?.info?.('请选择图片文件', 'Codex Image Bridge');
        return;
    }

    const characterName = $('#codex_image_bridge_character_name').val() || getCurrentCharacterName() || 'character';
    const uploaded = [];
    for (let index = 0; index < list.length; index++) {
        const file = list[index];
        setStatus(`正在上传参考图 ${index + 1}/${list.length}: ${file.name}`);
        const dataUrl = await readFileAsDataUrl(file);
        const savedPath = await saveReferenceImageDataUrl(dataUrl, `${characterName}-${Date.now()}-${index}-${file.name}`, characterName);
        uploaded.push(savedPath);
    }

    appendReferenceUrlsToForm(uploaded);
    await saveCharacterFromForm();
    await refreshCache({ syncServer: true }).catch(error => console.warn(`[${extensionName}] failed to refresh cache`, error));
    setStatus(`已上传并保存 ${uploaded.length} 张本地参考图`);
}

function reorderReferenceAt(refs, index, delta) {
    const next = normalizeReferenceList(refs);
    const target = index + delta;
    if (target < 0 || target >= next.length) {
        return next;
    }
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

function updateCharacterReferenceFormRefs(refs) {
    $('#codex_image_bridge_character_references').val(normalizeReferenceList(refs).join('\n'));
    renderCharacterReferencePreview();
}

function renderCharacterReferencePreview() {
    const container = document.getElementById('codex_image_bridge_character_reference_preview');
    if (!container) {
        return;
    }

    const refs = splitReferenceLines($('#codex_image_bridge_character_references').val());
    container.innerHTML = '';
    if (refs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'codex-image-bridge-reference-empty';
        empty.textContent = '还没有参考图；可上传本地图片，或从缓存加入';
        container.append(empty);
        return;
    }

    refs.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'codex-image-bridge-reference-thumb';

        const image = document.createElement('img');
        image.src = getPublicImageSrc(url);
        image.alt = getImageFileName(url);

        const name = document.createElement('span');
        name.className = 'codex-image-bridge-reference-name';
        name.textContent = `#${index + 1} ${getImageFileName(url)}`;

        const controls = document.createElement('div');
        controls.className = 'codex-image-bridge-reference-controls';

        const moveUp = document.createElement('button');
        moveUp.type = 'button';
        moveUp.className = 'codex-image-bridge-reference-action fa-solid fa-arrow-up';
        moveUp.title = '上移参考图';
        moveUp.disabled = index === 0;
        moveUp.addEventListener('click', event => {
            event.stopPropagation();
            updateCharacterReferenceFormRefs(reorderReferenceAt(refs, index, -1));
        });

        const moveDown = document.createElement('button');
        moveDown.type = 'button';
        moveDown.className = 'codex-image-bridge-reference-action fa-solid fa-arrow-down';
        moveDown.title = '下移参考图';
        moveDown.disabled = index === refs.length - 1;
        moveDown.addEventListener('click', event => {
            event.stopPropagation();
            updateCharacterReferenceFormRefs(reorderReferenceAt(refs, index, 1));
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'codex-image-bridge-reference-action danger fa-solid fa-trash';
        remove.title = '移除参考图';
        remove.addEventListener('click', event => {
            event.stopPropagation();
            const next = refs.filter((_, itemIndex) => itemIndex !== index);
            updateCharacterReferenceFormRefs(next);
        });

        controls.append(moveUp, moveDown, remove);
        item.append(image, name, controls);
        container.append(item);
    });
}

function renderCharacterLibrary() {
    const container = document.getElementById('codex_image_bridge_character_list');
    if (!container || !characterLibrary) {
        return;
    }

    container.innerHTML = '';
    if (characterLibrary.characters.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'codex-image-bridge-cache-empty';
        empty.textContent = '还没有角色';
        container.append(empty);
        return;
    }

    for (const profile of characterLibrary.characters) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'codex-image-bridge-character-card';
        button.classList.toggle('selected', profile.id === selectedCharacterId);

        const cover = document.createElement('div');
        cover.className = 'codex-image-bridge-character-cover';
        if (profile.references?.[0]) {
            const image = document.createElement('img');
            image.src = getPublicImageSrc(profile.references[0]);
            image.alt = profile.name;
            cover.append(image);
        } else {
            cover.textContent = profile.name.slice(0, 1).toUpperCase();
        }

        const body = document.createElement('div');
        body.className = 'codex-image-bridge-character-card-body';

        const title = document.createElement('strong');
        title.textContent = profile.name;

        const meta = document.createElement('span');
        meta.textContent = `${profile.references.length} 张参考图`;

        const tags = document.createElement('small');
        tags.textContent = profile.aliases?.slice(0, 3).join(' / ') || '';

        body.append(title, meta, tags);
        button.append(cover, body);
        button.addEventListener('click', () => writeCharacterForm(profile));
        container.append(button);
    }
}

async function refreshCharacterLibrary() {
    await readCharacterLibrary();
    if (!selectedCharacterId) {
        const current = getCurrentCharacterName();
        const matched = findCharacterProfile(current);
        writeCharacterForm(matched || { name: current });
    } else {
        renderCharacterLibrary();
    }
}

function bindCharacterLibraryUi() {
    $('#codex_image_bridge_character_use_current').on('click', () => {
        const current = getCurrentCharacterName();
        const matched = findCharacterProfile(current);
        writeCharacterForm(matched || { name: current });
    });
    $('#codex_image_bridge_character_new').on('click', () => {
        selectedCharacterId = '';
        writeCharacterForm({ name: getCurrentCharacterName() });
    });
    $('#codex_image_bridge_character_save').on('click', () => {
        saveCharacterFromForm().catch(error => notifyError(error instanceof Error ? error.message : String(error)));
    });
    $('#codex_image_bridge_character_delete').on('click', () => {
        deleteSelectedCharacter().catch(error => notifyError(error instanceof Error ? error.message : String(error)));
    });
    $('#codex_image_bridge_character_add_refs').on('click', addSelectedCacheImagesToCharacter);
    $('#codex_image_bridge_character_upload_refs').on('click', () => {
        document.getElementById('codex_image_bridge_character_upload_input')?.click();
    });
    $('#codex_image_bridge_character_upload_input').on('change', function () {
        uploadCharacterReferenceFiles(this.files)
            .catch(error => notifyError(error instanceof Error ? error.message : String(error)))
            .finally(() => {
                this.value = '';
            });
    });
    $('#codex_image_bridge_character_references').on('input', renderCharacterReferencePreview);
    $('#codex_image_bridge_character_refresh').on('click', () => {
        refreshCharacterLibrary().catch(error => notifyError(error instanceof Error ? error.message : String(error)));
    });
}

function getFilteredCacheImages() {
    const input = document.getElementById('codex_image_bridge_cache_search');
    const query = String(input?.value || '').trim().toLowerCase();
    if (!query) {
        return cacheImages;
    }

    return cacheImages.filter(entry => [
        entry.title,
        entry.prompt,
        entry.characterName,
        entry.userName,
        entry.fileName,
        entry.jobId,
        entry.chatId,
        entry.createdAt,
    ].join('\n').toLowerCase().includes(query));
}

function formatCacheDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return '';
    }
    return date.toLocaleString();
}

function makeCacheButton(text, onClick, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu_button';
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
}

function toggleCacheSelection(id) {
    if (selectedCacheImages.has(id)) {
        selectedCacheImages.delete(id);
    } else {
        selectedCacheImages.add(id);
    }
    renderCacheGrid();
}

function renderCachePagination(filteredImages, pageCount) {
    const container = document.getElementById('codex_image_bridge_cache_pagination');
    if (!container) {
        return;
    }

    container.innerHTML = '';
    if (filteredImages.length === 0) {
        return;
    }

    container.append(
        makeCacheButton('上一页', () => {
            cachePage = Math.max(1, cachePage - 1);
            renderCacheGrid();
        }, cachePage <= 1),
    );

    const pageText = document.createElement('span');
    pageText.className = 'codex-image-bridge-page-text';
    pageText.textContent = `${cachePage} / ${pageCount}`;
    container.append(pageText);

    container.append(
        makeCacheButton('下一页', () => {
            cachePage = Math.min(pageCount, cachePage + 1);
            renderCacheGrid();
        }, cachePage >= pageCount),
    );

    const jumpInput = document.createElement('input');
    jumpInput.type = 'number';
    jumpInput.min = '1';
    jumpInput.max = String(pageCount);
    jumpInput.value = String(cachePage);
    jumpInput.className = 'text_pole codex-image-bridge-page-input';

    const jumpButton = makeCacheButton('跳转', () => {
        const nextPage = clampInteger(jumpInput.value, cachePage, 1, pageCount);
        if (nextPage !== cachePage) {
            cachePage = nextPage;
            renderCacheGrid();
        }
    });

    jumpInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            jumpButton.click();
        }
    });

    container.append(jumpInput, jumpButton);
}

function updateCacheInfo(filteredCount = getFilteredCacheImages().length) {
    const info = document.getElementById('codex_image_bridge_cache_info');
    if (!info) {
        return;
    }

    const selectedText = selectedCacheImages.size > 0 ? `，已选 ${selectedCacheImages.size} 张` : '';
    info.textContent = `缓存 ${cacheImages.length} 张，当前显示 ${filteredCount} 张${selectedText}。图片目录: user/images/${imageFolderName}；索引: user/files/${cacheFileName}`;
}

function renderCacheGrid() {
    const grid = document.getElementById('codex_image_bridge_cache_grid');
    if (!grid) {
        return;
    }

    const filteredImages = getFilteredCacheImages();
    const pageCount = Math.max(1, Math.ceil(filteredImages.length / cachePageSize));
    cachePage = Math.min(Math.max(1, cachePage), pageCount);
    const start = (cachePage - 1) * cachePageSize;
    const pageImages = filteredImages.slice(start, start + cachePageSize);

    grid.innerHTML = '';
    grid.classList.toggle('multi-select-mode', cacheMultiSelect);

    if (pageImages.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'codex-image-bridge-cache-empty';
        empty.textContent = '还没有缓存图片';
        grid.append(empty);
    }

    for (const entry of pageImages) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'codex-image-bridge-cache-item';
        item.classList.toggle('selected', selectedCacheImages.has(entry.id));
        item.title = entry.prompt || entry.title;
        item.dataset.id = entry.id;

        const image = document.createElement('img');
        image.src = getPublicImageSrc(entry.url);
        image.alt = entry.title;
        image.loading = 'lazy';

        const info = document.createElement('span');
        info.className = 'codex-image-bridge-cache-meta';
        info.textContent = [entry.displayId ? `#${entry.displayId}` : '', entry.characterName || entry.title, formatCacheDate(entry.createdAt)].filter(Boolean).join(' · ');

        item.append(image, info);
        item.addEventListener('click', event => {
            if (cacheMultiSelect || event.ctrlKey || event.metaKey || event.shiftKey) {
                toggleCacheSelection(entry.id);
                return;
            }
            showCachePreview(entry);
        });
        grid.append(item);
    }

    renderCachePagination(filteredImages, pageCount);
    updateCacheInfo(filteredImages.length);
    $('#codex_image_bridge_cache_multiselect').toggleClass('active', cacheMultiSelect).val(cacheMultiSelect ? '取消多选' : '多选');
}

async function refreshCache({ syncServer = true } = {}) {
    const cache = await readCacheIndex();
    let images = cache.images;
    let changed = false;

    if (syncServer) {
        const synced = await syncCacheWithServerImages(images);
        images = synced.images;
        changed = synced.changed;
    }

    cacheImages = dedupeCacheImages(images);
    const ids = new Set(cacheImages.map(entry => entry.id));
    for (const id of Array.from(selectedCacheImages)) {
        if (!ids.has(id)) {
            selectedCacheImages.delete(id);
        }
    }

    if (changed) {
        await saveCacheIndex(cacheImages);
    }

    renderCacheGrid();
}

async function addImagesToCache(messageId, result, bridgeState) {
    const message = chat[messageId];
    if (!message || !Array.isArray(result.images) || result.images.length === 0) {
        return;
    }

    const settings = getSettings();
    const completedAt = result.createdAt || new Date().toISOString();
    const entries = result.images.map((image, index) => normalizeCacheImage(image, {
        id: makeCacheId(image?.url, bridgeState.jobId, index + 1),
        displayId: image?.displayId || makeBridgeImageDisplayId(bridgeState.jobId, image?.index || index + 1),
        jobId: bridgeState.jobId,
        chatId: bridgeState.chatId,
        groupId: bridgeState.groupId,
        messageId,
        characterName: bridgeState.characterName || message.name || '',
        userName: bridgeState.userName || getContext().name1 || '',
        title: image?.title || `Codex Image ${index + 1}`,
        prompt: image?.prompt || '',
        kind: image?.kind || 'narrative',
        source: extensionName,
        size: result.size || bridgeState.size || settings.size,
        style: result.style || bridgeState.style || settings.style,
        createdAt: image?.createdAt || completedAt,
        completedAt,
    })).filter(Boolean);

    if (entries.length === 0) {
        return;
    }

    const cache = await readCacheIndex();
    cacheImages = dedupeCacheImages([...entries, ...cache.images]);
    await saveCacheIndex(cacheImages);
    renderCacheGrid();
    renderFloatingPanel();
}

function closeCachePreview() {
    $('#codex_image_bridge_cache_preview').remove();
    $(document).off('keydown.codexImageBridgePreview');
}

function showCachePreview(entry) {
    closeCachePreview();

    const overlay = document.createElement('div');
    overlay.id = 'codex_image_bridge_cache_preview';
    overlay.className = 'codex-image-bridge-preview';

    const panel = document.createElement('div');
    panel.className = 'codex-image-bridge-preview-panel';

    const image = document.createElement('img');
    image.src = getPublicImageSrc(entry.url);
    image.alt = entry.title;

    const title = document.createElement('div');
    title.className = 'codex-image-bridge-preview-title';
    title.textContent = entry.title || entry.fileName || 'Codex Image';

    const meta = document.createElement('div');
    meta.className = 'codex-image-bridge-preview-meta';
    meta.textContent = [
        entry.displayId ? `#${entry.displayId}` : '',
        entry.characterName,
        formatCacheDate(entry.createdAt),
        entry.fileName,
    ].filter(Boolean).join(' · ');

    const prompt = document.createElement('pre');
    prompt.className = 'codex-image-bridge-preview-prompt';
    prompt.textContent = entry.prompt || '';

    const actions = document.createElement('div');
    actions.className = 'codex-image-bridge-preview-actions';
    actions.append(
        makeCacheButton('下载', () => downloadCacheImages([entry.id])),
        makeCacheButton('关闭', closeCachePreview),
    );

    panel.append(image, title, meta);
    if (entry.prompt) {
        panel.append(prompt);
    }
    panel.append(actions);
    overlay.append(panel);

    overlay.addEventListener('click', event => {
        if (event.target === overlay) {
            closeCachePreview();
        }
    });
    $(document).on('keydown.codexImageBridgePreview', event => {
        if (event.key === 'Escape') {
            closeCachePreview();
        }
    });

    document.body.append(overlay);
}

function showInlineBridgeImagePreview(imageElement) {
    const rawSrc = imageElement?.getAttribute?.('src') || '';
    const src = rawSrc.startsWith(window.location.origin)
        ? rawSrc.slice(window.location.origin.length)
        : rawSrc;
    const url = /^https?:\/\//i.test(src) || isInlineImageUrl(src) ? src : stripLeadingSlash(src);
    showCachePreview({
        id: makeCacheId(url, 'inline', 1),
        url,
        title: imageElement?.getAttribute?.('alt') || 'Codex Image',
        fileName: getImageFileName(url),
        prompt: '',
    });
}

function getSelectedCacheEntries(ids = Array.from(selectedCacheImages)) {
    const idSet = new Set(ids);
    return cacheImages.filter(entry => idSet.has(entry.id));
}

function safeDownloadName(value) {
    return String(value || 'codex-image.png').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 160) || 'codex-image.png';
}

async function fetchImageBlob(entry) {
    const response = await fetch(getPublicImageSrc(entry.url), { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`failed to download ${entry.url}: ${response.status}`);
    }
    return await response.blob();
}

function downloadBlob(blob, fileName) {
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = safeDownloadName(fileName);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function downloadCacheImages(ids = Array.from(selectedCacheImages)) {
    const entries = getSelectedCacheEntries(ids);
    if (entries.length === 0) {
        globalThis.toastr?.info?.('请先选择图片', 'Codex Image Bridge');
        return;
    }

    try {
        const JSZip = globalThis.JSZip;
        if (JSZip && entries.length > 1) {
            const zip = new JSZip();
            for (const entry of entries) {
                zip.file(safeDownloadName(entry.fileName || `${entry.id}.png`), await fetchImageBlob(entry));
            }
            const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
            downloadBlob(blob, 'codex-image-bridge-selected.zip');
        } else {
            for (const entry of entries) {
                downloadBlob(await fetchImageBlob(entry), entry.fileName || `${entry.id}.png`);
                await delay(150);
            }
        }
        setStatus(`已下载 ${entries.length} 张缓存图片`);
    } catch (error) {
        notifyError(error instanceof Error ? error.message : String(error));
    }
}

async function deleteImageFile(url) {
    if (!isBridgeImageUrl(url)) {
        return;
    }

    const context = getContext();
    const response = await fetch('/api/images/delete', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({ path: stripLeadingSlash(url) }),
    });

    if (!response.ok && response.status !== 404) {
        throw new Error(`failed to delete ${url}: ${response.status} ${await response.text()}`);
    }
}

async function removeCacheImagesFromCurrentChat(urls) {
    const urlSet = new Set(urls.map(stripLeadingSlash));
    let changed = false;

    for (let messageId = 0; messageId < chat.length; messageId++) {
        const message = chat[messageId];
        if (!message) {
            continue;
        }

        let messageChanged = false;
        if (Array.isArray(message.extra?.media)) {
            const before = message.extra.media.length;
            message.extra.media = message.extra.media.filter(media => !urlSet.has(stripLeadingSlash(media?.url)));
            if (message.extra.media.length !== before) {
                message.extra.media_index = Math.min(Math.max(0, message.extra.media_index || 0), Math.max(0, message.extra.media.length - 1));
                messageChanged = true;
            }
        }

        const beforeText = String(message.mes || '');
        const afterText = removeInlineBridgeImagesByUrl(beforeText, Array.from(urlSet));
        if (afterText !== beforeText) {
            message.mes = afterText;
            messageChanged = true;
        }

        if (messageChanged) {
            if (Array.isArray(message.extra?.media)) {
                message.extra.media_index = Math.min(Math.max(0, message.extra.media_index || 0), Math.max(0, message.extra.media.length - 1));
            }
            updateMessageBlock(messageId, message);
            changed = true;
        }
    }

    if (changed) {
        await saveChatConditional();
    }
}

async function deleteCacheImages(ids = Array.from(selectedCacheImages)) {
    const entries = getSelectedCacheEntries(ids);
    if (entries.length === 0) {
        globalThis.toastr?.info?.('请先选择图片', 'Codex Image Bridge');
        return;
    }

    const confirmed = typeof globalThis.confirm === 'function'
        ? globalThis.confirm(`确认删除 ${entries.length} 张 Codex 缓存图片？`)
        : true;
    if (!confirmed) {
        return;
    }

    try {
        for (const entry of entries) {
            await deleteImageFile(entry.url);
        }

        const deletedIds = new Set(entries.map(entry => entry.id));
        const deletedUrls = entries.map(entry => entry.url);
        cacheImages = cacheImages.filter(entry => !deletedIds.has(entry.id));
        for (const id of deletedIds) {
            selectedCacheImages.delete(id);
        }

        await removeCacheImagesFromCurrentChat(deletedUrls);
        await saveCacheIndex(cacheImages);
        renderCacheGrid();
        setStatus(`已删除 ${entries.length} 张缓存图片`);
    } catch (error) {
        notifyError(error instanceof Error ? error.message : String(error));
    }
}

function selectAllVisibleCacheImages() {
    for (const entry of getFilteredCacheImages()) {
        selectedCacheImages.add(entry.id);
    }
    cacheMultiSelect = true;
    renderCacheGrid();
}

function clearCacheSelection() {
    selectedCacheImages.clear();
    renderCacheGrid();
}

function bindCacheUi() {
    $('#codex_image_bridge_cache_refresh').on('click', () => {
        refreshCache({ syncServer: true }).catch(error => notifyError(error instanceof Error ? error.message : String(error)));
    });
    $('#codex_image_bridge_cache_multiselect').on('click', () => {
        cacheMultiSelect = !cacheMultiSelect;
        if (!cacheMultiSelect) {
            selectedCacheImages.clear();
        }
        renderCacheGrid();
    });
    $('#codex_image_bridge_cache_select_all').on('click', selectAllVisibleCacheImages);
    $('#codex_image_bridge_cache_deselect_all').on('click', clearCacheSelection);
    $('#codex_image_bridge_cache_download_selected').on('click', () => downloadCacheImages());
    $('#codex_image_bridge_cache_delete_selected').on('click', () => deleteCacheImages());
    $('#codex_image_bridge_cache_search').on('input', () => {
        cachePage = 1;
        renderCacheGrid();
    });
}

function setSettingValue(key, value) {
    getSettings()[key] = value;
    saveSettingsDebounced();
    writeSettingsToUi();
    scheduleActivityState('settings-updated');
    syncFloatingUi();
}

function openBridgeSettingsDrawer() {
    const root = document.getElementById('codex_image_bridge_settings');
    if (!root) {
        return;
    }
    const content = root.querySelector('.inline-drawer-content');
    if (content && getComputedStyle(content).display === 'none') {
        root.querySelector('.inline-drawer-toggle')?.click();
    }
    root.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function collapseSettingsDrawer() {
    const root = document.getElementById('codex_image_bridge_settings');
    if (root) {
        toggleDrawer(root, false);
    }
}

function makeFloatingButtonElement() {
    const button = document.createElement('button');
    button.id = 'codex_image_bridge_floating_button';
    button.type = 'button';
    button.className = 'codex-image-bridge-fab';
    button.title = 'Codex Image Bridge';
    button.innerHTML = '<i class="fa-solid fa-image"></i><span>Codex</span>';
    button.addEventListener('click', () => toggleFloatingPanel());
    return button;
}

function syncFloatingUi() {
    const settings = getSettings();
    let button = document.getElementById('codex_image_bridge_floating_button');
    if (!settings.floatingButton) {
        button?.remove();
        closeFloatingPanel();
        return;
    }
    if (!button) {
        button = makeFloatingButtonElement();
        document.body.append(button);
    }
    button.classList.toggle('active', floatingPanelOpen);
}

function closeFloatingPanel() {
    floatingPanelOpen = false;
    $('#codex_image_bridge_floating_panel').remove();
    $('#codex_image_bridge_app').remove();
    $('#codex_image_bridge_floating_button').removeClass('active');
}

function toggleFloatingPanel() {
    floatingPanelOpen = !floatingPanelOpen;
    if (!floatingPanelOpen) {
        closeFloatingPanel();
        return;
    }
    renderBridgeApp();
    syncFloatingUi();
    hydrateBridgeAppData().catch(error => notifyError(error instanceof Error ? error.message : String(error)));
}

function renderFloatingPanel() {
    renderBridgeApp();
}

function getBridgeAppTheme() {
    const theme = getSettings().uiTheme || 'auto';
    return ['auto', 'light', 'dark'].includes(theme) ? theme : 'auto';
}

async function hydrateBridgeAppData() {
    await Promise.all([
        refreshCharacterLibrary().catch(error => console.warn(`[${extensionName}] failed to refresh characters`, error)),
        refreshCache({ syncServer: true }).catch(error => console.warn(`[${extensionName}] failed to refresh cache`, error)),
        readOutfitLibrary().catch(error => {
            console.warn(`[${extensionName}] failed to read outfit library`, error);
            outfitLibrary = createEmptyOutfitLibrary();
        }),
        readAssetLibrary().catch(error => {
            console.warn(`[${extensionName}] failed to read asset library`, error);
            assetLibrary = createEmptyAssetLibrary();
        }),
    ]);
    renderBridgeApp();
}

function makeAppButton(label, onClick, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `menu_button ${className}`.trim();
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
}

function makeAppIconButton(icon, title, onClick, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `menu_button codex-image-bridge-icon-button ${className}`.trim();
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    button.addEventListener('click', onClick);
    return button;
}

function makeAppSection(title, actions = []) {
    const section = document.createElement('section');
    section.className = 'codex-image-bridge-app-section';
    const header = document.createElement('div');
    header.className = 'codex-image-bridge-app-section-header';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const toolbar = document.createElement('div');
    toolbar.className = 'codex-image-bridge-app-toolbar';
    toolbar.append(...actions);
    header.append(heading, toolbar);
    section.append(header);
    return section;
}

function renderViewModeButtons(mode, setter) {
    const group = document.createElement('label');
    group.className = 'codex-image-bridge-view-mode-select';
    const label = document.createElement('span');
    label.textContent = '显示';
    const select = document.createElement('select');
    select.className = 'text_pole';
    for (const [key, label] of [['large', '大图'], ['medium', '中图'], ['small', '小图'], ['list', '列表']]) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = label;
        option.selected = key === mode;
        select.append(option);
    }
    select.addEventListener('change', () => {
        setter(select.value);
        renderBridgeApp();
    });
    group.append(label, select);
    return group;
}

function getLibraryViewClass(mode) {
    return `codex-image-bridge-library-grid view-${mode || 'medium'}`;
}

function getSelectedCharacters() {
    const ids = new Set(selectedCharacterIds);
    return (characterLibrary?.characters || []).filter(item => ids.has(item.id));
}

function getSelectedOutfits() {
    const ids = new Set(selectedOutfitIds);
    return (outfitLibrary?.outfits || []).filter(item => ids.has(item.id));
}

function getSelectedAssets() {
    const ids = new Set(selectedAssetIds);
    return (assetLibrary?.items || []).filter(item => ids.has(item.id));
}

function toggleSetSelection(set, id, render = true) {
    if (set.has(id)) {
        set.delete(id);
    } else {
        set.add(id);
    }
    if (render) {
        renderBridgeApp();
    }
}

function clearSetSelection(set) {
    set.clear();
    renderBridgeApp();
}

function selectAllCharacters() {
    for (const item of characterLibrary?.characters || []) {
        selectedCharacterIds.add(item.id);
    }
    renderBridgeApp();
}

function selectAllOutfits() {
    for (const item of outfitLibrary?.outfits || []) {
        selectedOutfitIds.add(item.id);
    }
    renderBridgeApp();
}

function selectAllAssets() {
    for (const item of assetLibrary?.items || []) {
        selectedAssetIds.add(item.id);
    }
    renderBridgeApp();
}

async function deleteSelectedCharacters() {
    const selected = getSelectedCharacters();
    if (selected.length === 0) {
        globalThis.toastr?.info?.('请先选择角色', 'Codex Image Bridge');
        return;
    }
    const confirmed = typeof globalThis.confirm === 'function' ? globalThis.confirm(`确认删除 ${selected.length} 个角色？`) : true;
    if (!confirmed) {
        return;
    }
    const ids = new Set(selected.map(item => item.id));
    const library = characterLibrary || await readCharacterLibrary();
    selectedCharacterIds.clear();
    if (ids.has(selectedCharacterId)) {
        selectedCharacterId = '';
    }
    await saveCharacterLibrary({
        ...library,
        characters: library.characters.filter(item => !ids.has(item.id)),
    });
    setStatus(`已删除 ${selected.length} 个角色`);
    renderBridgeApp();
}

async function deleteSelectedOutfits() {
    const selected = getSelectedOutfits();
    if (selected.length === 0) {
        globalThis.toastr?.info?.('请先选择服装', 'Codex Image Bridge');
        return;
    }
    const confirmed = typeof globalThis.confirm === 'function' ? globalThis.confirm(`确认删除 ${selected.length} 个服装？`) : true;
    if (!confirmed) {
        return;
    }
    const ids = new Set(selected.map(item => item.id));
    const library = outfitLibrary || await readOutfitLibrary();
    selectedOutfitIds.clear();
    await saveOutfitLibrary({
        ...library,
        outfits: library.outfits.filter(item => !ids.has(item.id)),
    });
    setStatus(`已删除 ${selected.length} 个服装`);
}

async function deleteSelectedAssets() {
    const selected = getSelectedAssets();
    if (selected.length === 0) {
        globalThis.toastr?.info?.('请先选择条目', 'Codex Image Bridge');
        return;
    }
    const confirmed = typeof globalThis.confirm === 'function' ? globalThis.confirm(`确认删除 ${selected.length} 个条目？`) : true;
    if (!confirmed) {
        return;
    }
    const ids = new Set(selected.map(item => item.id));
    const library = assetLibrary || await readAssetLibrary();
    selectedAssetIds.clear();
    await saveAssetLibrary({
        ...library,
        items: library.items.filter(item => !ids.has(item.id)),
    });
    setStatus(`已删除 ${selected.length} 个其他库条目`);
}

function renderCharacterLibraryPage(container) {
    const section = makeAppSection('角色库', [
        makeAppButton('当前角色', () => {
            const current = getCurrentCharacterName();
            const matched = findCharacterProfile(current);
            selectedCharacterIds.clear();
            selectedCharacterId = matched?.id || '';
            if (matched) {
                selectedCharacterIds.add(matched.id);
            }
            renderBridgeApp();
        }),
        makeAppButton('新建', () => {
            selectedCharacterIds.clear();
            selectedCharacterId = '';
            appActivePage = 'character-detail';
            renderBridgeApp();
        }),
        makeAppButton('全选', selectAllCharacters),
        makeAppButton('取消', () => {
            selectedCharacterId = '';
            clearSetSelection(selectedCharacterIds);
        }),
        makeAppButton('删除选中', () => deleteSelectedCharacters().catch(error => notifyError(error instanceof Error ? error.message : String(error))), 'danger'),
        renderViewModeButtons(characterViewMode, value => { characterViewMode = value; }),
    ]);

    const grid = document.createElement('div');
    grid.className = getLibraryViewClass(characterViewMode);
    const characters = characterLibrary?.characters || [];
    if (characters.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'codex-image-bridge-app-empty';
        empty.textContent = '角色库为空';
        grid.append(empty);
    }
    for (const profile of characters) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'codex-image-bridge-app-card';
        card.classList.toggle('selected', selectedCharacterIds.has(profile.id));
        card.addEventListener('click', event => {
            if (event.target.closest('.codex-image-bridge-card-action')) {
                return;
            }
            if (selectedCharacterIds.has(profile.id)) {
                selectedCharacterIds.delete(profile.id);
                selectedCharacterId = getSelectedCharacters()[0]?.id || '';
            } else {
                selectedCharacterIds.add(profile.id);
                selectedCharacterId = profile.id;
            }
            renderBridgeApp();
        });

        const cover = document.createElement('div');
        cover.className = 'codex-image-bridge-app-cover';
        if (profile.references?.[0]) {
            const image = document.createElement('img');
            image.src = getPublicImageSrc(profile.references[0]);
            image.loading = 'lazy';
            cover.append(image);
        } else {
            cover.textContent = profile.name.slice(0, 1).toUpperCase();
        }

        const body = document.createElement('div');
        body.className = 'codex-image-bridge-app-card-body';
        const title = document.createElement('strong');
        title.textContent = profile.name;
        const meta = document.createElement('span');
        meta.textContent = `${profile.references?.length || 0} 张参考图`;
        const desc = document.createElement('small');
        desc.textContent = profile.aliases?.join(' / ') || '';
        const edit = makeAppButton('编辑', event => {
            event.stopPropagation();
            selectedCharacterIds.clear();
            selectedCharacterIds.add(profile.id);
            selectedCharacterId = profile.id;
            appActivePage = 'character-detail';
            renderBridgeApp();
        }, 'codex-image-bridge-card-action');
        body.append(title, meta, desc, edit);
        card.append(cover, body);
        grid.append(card);
    }

    section.append(grid);
    container.append(section);
}

function renderCharacterDetailPage(container) {
    const selectedProfile = getAppSelectedCharacter();
    const editorProfile = selectedProfile || { name: getCurrentCharacterName(), aliases: [], references: [] };
    if (selectedProfile) {
        selectedCharacterId = selectedProfile.id;
    }

    const section = makeAppSection('角色卡', [
        makeAppButton('返回角色库', () => {
            appActivePage = 'characters';
            renderBridgeApp();
        }),
    ]);

    const editor = document.createElement('div');
    editor.id = 'codex_image_bridge_app_character_editor';
    editor.className = 'codex-image-bridge-app-editor codex-image-bridge-app-character-editor';
    editor.innerHTML = `
        <label><span>角色名</span><input data-cib-character-name class="text_pole" value="${escapeHtmlAttribute(editorProfile.name || '')}"></label>
        <label><span>别名</span><textarea data-cib-character-aliases class="text_pole" rows="3">${escapeHtmlText((editorProfile.aliases || []).join('\n'))}</textarea></label>
        <label class="wide"><span>外貌识别要点</span><textarea data-cib-character-appearance class="text_pole" rows="4">${escapeHtmlText(editorProfile.appearance || '')}</textarea></label>
        <label class="wide"><span>常用服装/标志物</span><textarea data-cib-character-outfit class="text_pole" rows="3">${escapeHtmlText(editorProfile.outfit || '')}</textarea></label>
        <label class="wide"><span>性格/表情倾向</span><textarea data-cib-character-personality class="text_pole" rows="3">${escapeHtmlText(editorProfile.personality || '')}</textarea></label>
        <label class="wide"><span>角色负面提示</span><textarea data-cib-character-negative class="text_pole" rows="3">${escapeHtmlText(editorProfile.negative || '')}</textarea></label>
        <label class="wide"><span>参考图</span><textarea data-cib-character-references class="text_pole" rows="4">${escapeHtmlText((editorProfile.references || []).join('\n'))}</textarea></label>
        <div data-cib-character-reference-preview class="codex-image-bridge-app-reference-preview wide"></div>
    `;
    const preview = editor.querySelector('[data-cib-character-reference-preview]');
    const writePreviewRefs = refs => {
        const textarea = editor.querySelector('[data-cib-character-references]');
        if (textarea) {
            textarea.value = normalizeReferenceList(refs).join('\n');
        }
    };
    const refreshPreview = () => renderAppReferencePreview(
        preview,
        splitReferenceLines(readTextValue(editor, '[data-cib-character-references]')),
        writePreviewRefs,
    );
    editor.querySelectorAll('[data-cib-character-references]').forEach(input => {
        input.addEventListener('input', refreshPreview);
    });
    refreshPreview();
    editor.append(makeAppButton('上传参考图', () => document.getElementById('codex_image_bridge_app_character_upload_input')?.click()));
    editor.append(makeAppButton('保存角色', () => saveCharacterFromApp(editor).catch(error => notifyError(error instanceof Error ? error.message : String(error)))));

    const uploadInput = document.createElement('input');
    uploadInput.id = 'codex_image_bridge_app_character_upload_input';
    uploadInput.type = 'file';
    uploadInput.accept = 'image/*';
    uploadInput.multiple = true;
    uploadInput.hidden = true;
    uploadInput.addEventListener('change', function () {
        uploadCharacterReferenceFilesToApp(editor, this.files)
            .catch(error => notifyError(error instanceof Error ? error.message : String(error)))
            .finally(() => {
                this.value = '';
            });
    });
    section.append(editor, uploadInput);
    container.append(section);
}

function readTextValue(root, selector) {
    return String(root.querySelector(selector)?.value || '').trim();
}

function escapeHtmlText(value) {
    return String(value ?? '').replace(/[&<>]/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
    }[character]));
}

function escapeHtmlAttribute(value) {
    return escapeHtmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getAppSelectedCharacter() {
    const selected = getSelectedCharacters()[0];
    if (selected) {
        return selected;
    }
    return (characterLibrary?.characters || []).find(profile => profile.id === selectedCharacterId) || null;
}

function renderAppReferencePreview(container, refs = [], onChange = null) {
    if (!container) {
        return;
    }
    container.innerHTML = '';
    const references = normalizeReferenceList(refs);
    if (references.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'codex-image-bridge-app-empty';
        empty.textContent = '暂无参考图';
        container.append(empty);
        return;
    }
    const commit = next => {
        const normalized = normalizeReferenceList(next);
        if (typeof onChange === 'function') {
            onChange(normalized);
        }
        renderAppReferencePreview(container, normalized, onChange);
    };
    references.forEach((ref, index) => {
        const item = document.createElement('div');
        item.className = 'codex-image-bridge-app-reference';
        const image = document.createElement('img');
        image.src = getPublicImageSrc(ref);
        image.loading = 'lazy';

        const meta = document.createElement('div');
        meta.className = 'codex-image-bridge-app-reference-meta';
        meta.textContent = `#${index + 1} ${getImageFileName(ref)}`;

        const controls = document.createElement('div');
        controls.className = 'codex-image-bridge-app-reference-controls';

        const moveUp = makeAppIconButton('fa-arrow-up', '上移参考图', () => commit(reorderReferenceAt(references, index, -1)));
        moveUp.disabled = index === 0;
        const moveDown = makeAppIconButton('fa-arrow-down', '下移参考图', () => commit(reorderReferenceAt(references, index, 1)));
        moveDown.disabled = index === references.length - 1;
        const remove = makeAppIconButton('fa-trash', '删除参考图', () => commit(references.filter((_, itemIndex) => itemIndex !== index)), 'danger');

        controls.append(moveUp, moveDown, remove);
        item.append(image, meta, controls);
        container.append(item);
    });
}

function readCharacterFromApp(root) {
    const existing = characterLibrary?.characters?.find(profile => profile.id === selectedCharacterId) || getAppSelectedCharacter() || {};
    return normalizeCharacterProfile({
        ...existing,
        id: selectedCharacterId || readTextValue(root, '[data-cib-character-name]'),
        name: readTextValue(root, '[data-cib-character-name]'),
        aliases: splitLines(readTextValue(root, '[data-cib-character-aliases]')),
        appearance: readTextValue(root, '[data-cib-character-appearance]'),
        outfit: readTextValue(root, '[data-cib-character-outfit]'),
        personality: readTextValue(root, '[data-cib-character-personality]'),
        negative: readTextValue(root, '[data-cib-character-negative]'),
        references: splitReferenceLines(readTextValue(root, '[data-cib-character-references]')),
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
    });
}

async function saveCharacterFromApp(root) {
    const profile = readCharacterFromApp(root);
    if (!profile) {
        notifyError('角色名称不能为空');
        return;
    }

    const library = characterLibrary || await readCharacterLibrary();
    const characters = library.characters.filter(item => item.id !== profile.id && normalizeName(item.name) !== normalizeName(profile.name));
    characters.push(profile);
    selectedCharacterId = profile.id;
    selectedCharacterIds.clear();
    selectedCharacterIds.add(profile.id);
    await saveCharacterLibrary({ ...library, characters });
    setStatus(`已保存角色: ${profile.name}`);
    renderBridgeApp();
}

function appendReferenceUrlsToAppEditor(root, urls) {
    const textarea = root.querySelector('[data-cib-character-references]');
    const preview = root.querySelector('[data-cib-character-reference-preview]');
    const current = new Set(splitReferenceLines(textarea?.value || ''));
    for (const url of urls || []) {
        if (url) {
            current.add(stripLeadingSlash(url));
        }
    }
    const next = Array.from(current);
    if (textarea) {
        textarea.value = next.join('\n');
    }
    renderAppReferencePreview(preview, next, updated => {
        if (textarea) {
            textarea.value = normalizeReferenceList(updated).join('\n');
        }
    });
}

async function uploadCharacterReferenceFilesToApp(root, files) {
    const list = Array.from(files || []).filter(file => file?.type?.startsWith('image/'));
    if (list.length === 0) {
        globalThis.toastr?.info?.('请选择图片文件', 'Codex Image Bridge');
        return;
    }
    const characterName = readTextValue(root, '[data-cib-character-name]') || getCurrentCharacterName() || 'character';
    const uploaded = [];
    for (let index = 0; index < list.length; index++) {
        const file = list[index];
        setStatus(`正在上传参考图 ${index + 1}/${list.length}: ${file.name}`);
        const dataUrl = await readFileAsDataUrl(file);
        uploaded.push(await saveReferenceImageDataUrl(dataUrl, `${characterName}-${Date.now()}-${index}-${file.name}`, characterName));
    }
    appendReferenceUrlsToAppEditor(root, uploaded);
    await saveCharacterFromApp(root);
    await refreshCache({ syncServer: true }).catch(error => console.warn(`[${extensionName}] failed to refresh cache`, error));
    setStatus(`已上传并保存 ${uploaded.length} 张本地参考图`);
}

async function saveOutfitFromApp(root) {
    const name = readTextValue(root, '[data-cib-outfit-name]');
    if (!name) {
        notifyError('服装名称不能为空');
        return;
    }
    const library = outfitLibrary || await readOutfitLibrary();
    const selected = getSelectedOutfits()[0];
    const profile = normalizeOutfitProfile({
        id: selected?.id || `outfit-${name}`,
        name,
        characterName: readTextValue(root, '[data-cib-outfit-character]'),
        tags: splitLines(readTextValue(root, '[data-cib-outfit-tags]')),
        prompt: readTextValue(root, '[data-cib-outfit-prompt]'),
        negative: readTextValue(root, '[data-cib-outfit-negative]'),
        references: splitReferenceLines(readTextValue(root, '[data-cib-outfit-references]')),
        notes: readTextValue(root, '[data-cib-outfit-notes]'),
        createdAt: selected?.createdAt,
        updatedAt: new Date().toISOString(),
    });
    await saveOutfitLibrary({
        ...library,
        outfits: [...library.outfits.filter(item => item.id !== profile.id), profile],
    });
    selectedOutfitIds.clear();
    selectedOutfitIds.add(profile.id);
    setStatus(`已保存服装: ${profile.name}`);
}

function renderOutfitLibraryPage(container) {
    const selected = getSelectedOutfits()[0] || {};
    const section = makeAppSection('服装库', [
        makeAppButton('新建', () => {
            selectedOutfitIds.clear();
            renderBridgeApp();
        }),
        makeAppButton('全选', selectAllOutfits),
        makeAppButton('取消', () => clearSetSelection(selectedOutfitIds)),
        makeAppButton('删除选中', () => deleteSelectedOutfits().catch(error => notifyError(error instanceof Error ? error.message : String(error))), 'danger'),
        renderViewModeButtons(outfitViewMode, value => { outfitViewMode = value; }),
    ]);

    const editor = document.createElement('div');
    editor.className = 'codex-image-bridge-app-editor';
    editor.innerHTML = `
        <label><span>服装名</span><input data-cib-outfit-name class="text_pole" value="${escapeHtmlAttribute(selected.name || '')}"></label>
        <label><span>绑定角色</span><input data-cib-outfit-character class="text_pole" value="${escapeHtmlAttribute(selected.characterName || getCurrentCharacterName())}"></label>
        <label><span>标签</span><input data-cib-outfit-tags class="text_pole" value="${escapeHtmlAttribute((selected.tags || []).join(', '))}"></label>
        <label><span>负面提示</span><input data-cib-outfit-negative class="text_pole" value="${escapeHtmlAttribute(selected.negative || '')}"></label>
        <label class="wide"><span>服装提示词</span><textarea data-cib-outfit-prompt class="text_pole" rows="3">${escapeHtmlText(selected.prompt || '')}</textarea></label>
        <label class="wide"><span>参考图</span><textarea data-cib-outfit-references class="text_pole" rows="2">${escapeHtmlText((selected.references || []).join('\n'))}</textarea></label>
        <label class="wide"><span>备注</span><textarea data-cib-outfit-notes class="text_pole" rows="2">${escapeHtmlText(selected.notes || '')}</textarea></label>
    `;
    editor.append(makeAppButton('保存服装', () => saveOutfitFromApp(editor).catch(error => notifyError(error instanceof Error ? error.message : String(error)))));
    section.append(editor);

    const grid = document.createElement('div');
    grid.className = getLibraryViewClass(outfitViewMode);
    const outfits = outfitLibrary?.outfits || [];
    if (outfits.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'codex-image-bridge-app-empty';
        empty.textContent = '服装库为空';
        grid.append(empty);
    }
    for (const outfit of outfits) {
        grid.append(renderSimpleLibraryCard(outfit, selectedOutfitIds, () => {
            selectedOutfitIds.clear();
            selectedOutfitIds.add(outfit.id);
            renderBridgeApp();
        }));
    }
    section.append(grid);
    container.append(section);
}

async function saveAssetFromApp(root) {
    const name = readTextValue(root, '[data-cib-asset-name]');
    if (!name) {
        notifyError('条目名称不能为空');
        return;
    }
    const library = assetLibrary || await readAssetLibrary();
    const selected = getSelectedAssets()[0];
    const item = normalizeAssetItem({
        id: selected?.id || `asset-${name}`,
        name,
        type: readTextValue(root, '[data-cib-asset-type]') || '其他',
        tags: splitLines(readTextValue(root, '[data-cib-asset-tags]')),
        prompt: readTextValue(root, '[data-cib-asset-prompt]'),
        references: splitReferenceLines(readTextValue(root, '[data-cib-asset-references]')),
        notes: readTextValue(root, '[data-cib-asset-notes]'),
        createdAt: selected?.createdAt,
        updatedAt: new Date().toISOString(),
    });
    await saveAssetLibrary({
        ...library,
        items: [...library.items.filter(entry => entry.id !== item.id), item],
    });
    selectedAssetIds.clear();
    selectedAssetIds.add(item.id);
    setStatus(`已保存条目: ${item.name}`);
}

function renderAssetLibraryPage(container) {
    const selected = getSelectedAssets()[0] || {};
    const section = makeAppSection('其他库', [
        makeAppButton('新建', () => {
            selectedAssetIds.clear();
            renderBridgeApp();
        }),
        makeAppButton('全选', selectAllAssets),
        makeAppButton('取消', () => clearSetSelection(selectedAssetIds)),
        makeAppButton('删除选中', () => deleteSelectedAssets().catch(error => notifyError(error instanceof Error ? error.message : String(error))), 'danger'),
        renderViewModeButtons(assetViewMode, value => { assetViewMode = value; }),
    ]);

    const editor = document.createElement('div');
    editor.className = 'codex-image-bridge-app-editor';
    editor.innerHTML = `
        <label><span>名称</span><input data-cib-asset-name class="text_pole" value="${escapeHtmlAttribute(selected.name || '')}"></label>
        <label><span>类型</span><input data-cib-asset-type class="text_pole" value="${escapeHtmlAttribute(selected.type || '场景/道具/地点')}"></label>
        <label><span>标签</span><input data-cib-asset-tags class="text_pole" value="${escapeHtmlAttribute((selected.tags || []).join(', '))}"></label>
        <label class="wide"><span>提示词/描述</span><textarea data-cib-asset-prompt class="text_pole" rows="3">${escapeHtmlText(selected.prompt || '')}</textarea></label>
        <label class="wide"><span>参考图</span><textarea data-cib-asset-references class="text_pole" rows="2">${escapeHtmlText((selected.references || []).join('\n'))}</textarea></label>
        <label class="wide"><span>备注</span><textarea data-cib-asset-notes class="text_pole" rows="2">${escapeHtmlText(selected.notes || '')}</textarea></label>
    `;
    editor.append(makeAppButton('保存条目', () => saveAssetFromApp(editor).catch(error => notifyError(error instanceof Error ? error.message : String(error)))));
    section.append(editor);

    const grid = document.createElement('div');
    grid.className = getLibraryViewClass(assetViewMode);
    const items = assetLibrary?.items || [];
    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'codex-image-bridge-app-empty';
        empty.textContent = '其他库为空';
        grid.append(empty);
    }
    for (const item of items) {
        grid.append(renderSimpleLibraryCard(item, selectedAssetIds, () => {
            selectedAssetIds.clear();
            selectedAssetIds.add(item.id);
            renderBridgeApp();
        }));
    }
    section.append(grid);
    container.append(section);
}

function renderSimpleLibraryCard(item, selectedSet, onEdit) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'codex-image-bridge-app-card';
    card.classList.toggle('selected', selectedSet.has(item.id));
    card.addEventListener('click', event => {
        if (event.target.closest('.codex-image-bridge-card-action')) {
            return;
        }
        toggleSetSelection(selectedSet, item.id);
    });

    const cover = document.createElement('div');
    cover.className = 'codex-image-bridge-app-cover';
    if (item.references?.[0]) {
        const image = document.createElement('img');
        image.src = getPublicImageSrc(item.references[0]);
        image.loading = 'lazy';
        cover.append(image);
    } else {
        cover.textContent = item.name.slice(0, 1).toUpperCase();
    }

    const body = document.createElement('div');
    body.className = 'codex-image-bridge-app-card-body';
    const title = document.createElement('strong');
    title.textContent = item.name;
    const meta = document.createElement('span');
    meta.textContent = [item.characterName, item.type, ...(item.tags || []).slice(0, 3)].filter(Boolean).join(' · ');
    const desc = document.createElement('small');
    desc.textContent = truncateText(item.prompt || item.notes || '', 90);
    const edit = makeAppButton('编辑', event => {
        event.stopPropagation();
        onEdit();
    }, 'codex-image-bridge-card-action');
    body.append(title, meta, desc, edit);
    card.append(cover, body);
    return card;
}

function renderCacheLibraryPage(container) {
    const section = makeAppSection('缓存库', [
        makeAppButton('刷新', () => refreshCache({ syncServer: true }).then(renderBridgeApp).catch(error => notifyError(error instanceof Error ? error.message : String(error)))),
        makeAppButton('多选', () => {
            cacheMultiSelect = !cacheMultiSelect;
            if (!cacheMultiSelect) {
                selectedCacheImages.clear();
            }
            renderBridgeApp();
        }, cacheMultiSelect ? 'active' : ''),
        makeAppButton('全选', () => {
            selectAllVisibleCacheImages();
            renderBridgeApp();
        }),
        makeAppButton('取消', () => {
            clearCacheSelection();
            renderBridgeApp();
        }),
        makeAppButton('下载选中', () => downloadCacheImages()),
        makeAppButton('删除选中', () => deleteCacheImages().then(renderBridgeApp).catch(error => notifyError(error instanceof Error ? error.message : String(error))), 'danger'),
        renderViewModeButtons(cacheViewMode, value => { cacheViewMode = value; }),
    ]);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'text_pole codex-image-bridge-app-search';
    search.placeholder = '搜索角色、文件名、提示词、jobId';
    search.value = document.getElementById('codex_image_bridge_cache_search')?.value || '';
    search.addEventListener('input', () => {
        $('#codex_image_bridge_cache_search').val(search.value);
        cachePage = 1;
        renderBridgeApp();
    });
    section.append(search);

    const filtered = getFilteredCacheImages();
    const grid = document.createElement('div');
    grid.className = `${getLibraryViewClass(cacheViewMode)} cache-view`;
    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'codex-image-bridge-app-empty';
        empty.textContent = '缓存库为空';
        grid.append(empty);
    }
    for (const entry of filtered) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'codex-image-bridge-app-card';
        card.classList.toggle('selected', selectedCacheImages.has(entry.id));
        card.addEventListener('click', event => {
            if (cacheMultiSelect || event.ctrlKey || event.metaKey || event.shiftKey) {
                toggleCacheSelection(entry.id);
                renderBridgeApp();
                return;
            }
            showCachePreview(entry);
        });

        const cover = document.createElement('div');
        cover.className = 'codex-image-bridge-app-cover';
        const image = document.createElement('img');
        image.src = getPublicImageSrc(entry.url);
        image.loading = 'lazy';
        cover.append(image);

        const body = document.createElement('div');
        body.className = 'codex-image-bridge-app-card-body';
        const title = document.createElement('strong');
        title.textContent = entry.characterName || entry.title || entry.fileName;
        const meta = document.createElement('span');
        meta.textContent = [entry.displayId ? `#${entry.displayId}` : '', formatCacheDate(entry.createdAt), entry.size, entry.fileName].filter(Boolean).join(' · ');
        const desc = document.createElement('small');
        desc.textContent = truncateText(entry.prompt || entry.url, 100);
        body.append(title, meta, desc);
        card.append(cover, body);
        grid.append(card);
    }
    section.append(grid);
    const info = document.createElement('div');
    info.className = 'codex-image-bridge-app-info';
    info.textContent = `缓存 ${cacheImages.length} 张，当前显示 ${filtered.length} 张，已选 ${selectedCacheImages.size} 张。`;
    section.append(info);
    container.append(section);
}

function renderDashboardPage(container) {
    const section = makeAppSection('总览', [
        makeAppButton('检查结果', () => {
            markActivityState('manual-resume');
            resumePendingJobs({ refreshCompleted: true, force: true });
            setStatus('已重新检查等待中和已完成的结果文件');
            renderBridgeApp();
        }),
        makeAppButton('刷新全部', () => hydrateBridgeAppData().catch(error => notifyError(error instanceof Error ? error.message : String(error)))),
    ]);

    const stats = document.createElement('div');
    stats.className = 'codex-image-bridge-app-stats';
    for (const [label, value] of [
        ['角色', characterLibrary?.characters?.length || 0],
        ['服装', outfitLibrary?.outfits?.length || 0],
        ['缓存图', cacheImages.length],
        ['其他条目', assetLibrary?.items?.length || 0],
    ]) {
        const item = document.createElement('div');
        item.className = 'codex-image-bridge-app-stat';
        item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
        stats.append(item);
    }
    section.append(stats);

    const latest = document.createElement('div');
    latest.className = `${getLibraryViewClass('small')} cache-view`;
    for (const entry of cacheImages.slice(0, 12)) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'codex-image-bridge-app-card';
        card.addEventListener('click', () => showCachePreview(entry));
        const cover = document.createElement('div');
        cover.className = 'codex-image-bridge-app-cover';
        const image = document.createElement('img');
        image.src = getPublicImageSrc(entry.url);
        image.loading = 'lazy';
        cover.append(image);
        const body = document.createElement('div');
        body.className = 'codex-image-bridge-app-card-body';
        const title = document.createElement('strong');
        title.textContent = entry.characterName || entry.title;
        const meta = document.createElement('span');
        meta.textContent = formatCacheDate(entry.createdAt);
        body.append(title, meta);
        card.append(cover, body);
        latest.append(card);
    }
    if (!cacheImages.length) {
        const empty = document.createElement('div');
        empty.className = 'codex-image-bridge-app-empty';
        empty.textContent = '暂无缓存图';
        latest.append(empty);
    }
    section.append(latest);
    container.append(section);
}

function renderSettingsAppPage(container) {
    const settings = getSettings();
    const section = makeAppSection('设置', [
        makeAppButton('打开旧设置抽屉', openBridgeSettingsDrawer),
    ]);
    const form = document.createElement('div');
    form.className = 'codex-image-bridge-app-editor';
    form.innerHTML = `
        <label class="checkbox_label"><input data-cib-app-setting="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}><span>自动生成图片</span></label>
        <label class="checkbox_label"><input data-cib-app-setting="fastMode" type="checkbox" ${settings.fastMode ? 'checked' : ''}><span>极速模式</span></label>
        <label class="checkbox_label"><input data-cib-app-setting="useWorldbookDirectives" type="checkbox" ${settings.useWorldbookDirectives ? 'checked' : ''}><span>世界书视觉指令</span></label>
        <label class="checkbox_label"><input data-cib-app-setting="renderMediaBlocks" type="checkbox" ${settings.renderMediaBlocks ? 'checked' : ''}><span>HTML 介质转图</span></label>
        <label><span>尺寸</span><select data-cib-app-setting="size" class="text_pole">
            ${['512x512', '1024x1024', '1024x1536', '1536x1024', 'auto'].map(size => `<option value="${size}" ${settings.size === size ? 'selected' : ''}>${size}</option>`).join('')}
        </select></label>
        <label><span>主题</span><select data-cib-app-setting="uiTheme" class="text_pole">
            ${[['auto', '跟随酒馆'], ['light', '亮色'], ['dark', '暗色']].map(([value, label]) => `<option value="${value}" ${settings.uiTheme === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select></label>
        <label><span>最少张数</span><input data-cib-app-setting="minImages" type="number" min="1" max="6" step="1" class="text_pole" value="${settings.minImages}"></label>
        <label><span>最多张数</span><input data-cib-app-setting="maxImages" type="number" min="1" max="6" step="1" class="text_pole" value="${settings.maxImages}"></label>
        <label><span>上下文条数</span><input data-cib-app-setting="contextMessages" type="number" min="0" max="12" step="1" class="text_pole" value="${settings.contextMessages}"></label>
        <label><span>视觉记忆条数</span><input data-cib-app-setting="memoryItems" type="number" min="0" max="12" step="1" class="text_pole" value="${settings.memoryItems}"></label>
        <label><span>结果轮询(ms)</span><input data-cib-app-setting="resultPollMs" type="number" min="2000" max="300000" step="1000" class="text_pole" value="${settings.resultPollMs}"></label>
        <label class="wide"><span>统一画风</span><input data-cib-app-setting="style" class="text_pole" value="${escapeHtmlAttribute(settings.style)}"></label>
        <label class="wide"><span>固定提示词模板</span><textarea data-cib-app-setting="promptTemplate" class="text_pole" rows="8">${escapeHtmlText(settings.promptTemplate)}</textarea></label>
    `;
    form.querySelectorAll('[data-cib-app-setting]').forEach(input => {
        const update = () => {
            const key = input.dataset.cibAppSetting;
            getSettings()[key] = readSettingInput(input);
            saveSettingsDebounced();
            writeSettingsToUi();
            scheduleActivityState('settings-updated');
            if (key === 'uiTheme') {
                renderBridgeApp();
            }
        };
        input.addEventListener('input', update);
        input.addEventListener('change', update);
    });
    section.append(form);
    container.append(section);
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('无法读取图片数据'));
        reader.readAsDataURL(blob);
    });
}

function collectBackupImageUrls(bundle) {
    const urls = new Set();
    for (const image of bundle.cache?.images || []) {
        if (isBridgeImageUrl(image.url)) {
            urls.add(stripLeadingSlash(image.url));
        }
    }
    for (const group of [bundle.characters?.characters, bundle.outfits?.outfits, bundle.assets?.items]) {
        for (const item of Array.isArray(group) ? group : []) {
            for (const url of item.references || []) {
                if (isBridgeImageUrl(url)) {
                    urls.add(stripLeadingSlash(url));
                }
            }
        }
    }
    return Array.from(urls);
}

async function exportBridgeBackup(includeImages = true) {
    setStatus('正在打包 Bridge 备份');
    const bundle = {
        schema: 'codex-image-bridge.backup.v1',
        createdAt: new Date().toISOString(),
        settings: { ...getSettings() },
        characters: await readCharacterLibrary(),
        outfits: await readOutfitLibrary(),
        assets: await readAssetLibrary(),
        cache: await readCacheIndex(),
        memory: await readMemoryIndex(),
        imageFiles: [],
    };

    if (includeImages) {
        for (const url of collectBackupImageUrls(bundle)) {
            try {
                const blob = await fetchImageBlob({ url });
                bundle.imageFiles.push({
                    path: url,
                    dataUrl: await blobToDataUrl(blob),
                });
            } catch (error) {
                console.warn(`[${extensionName}] failed to embed backup image ${url}`, error);
            }
        }
    }

    downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }), `codex-image-bridge-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    setStatus(`已导出 Bridge 备份：${bundle.imageFiles.length} 个图片文件`);
}

async function importBridgeBackupFile(file) {
    if (!file) {
        return;
    }
    const text = await file.text();
    const bundle = JSON.parse(text);
    if (bundle.schema !== 'codex-image-bridge.backup.v1') {
        throw new Error('不是 Codex Image Bridge 备份文件');
    }
    const confirmed = typeof globalThis.confirm === 'function'
        ? globalThis.confirm('确认导入备份？当前 Bridge 设置和库数据会被覆盖。')
        : true;
    if (!confirmed) {
        return;
    }

    setStatus('正在导入 Bridge 备份');
    if (Array.isArray(bundle.imageFiles)) {
        for (const fileEntry of bundle.imageFiles) {
            if (fileEntry?.dataUrl) {
                await saveReferenceImageDataUrl(fileEntry.dataUrl, getImageFileName(fileEntry.path), imageFolderName);
            }
        }
    }

    if (bundle.settings && typeof bundle.settings === 'object') {
        extension_settings[extensionName] = {
            ...defaultSettings,
            ...bundle.settings,
            settingsSchemaVersion,
        };
        saveSettingsDebounced();
        writeSettingsToUi();
    }
    if (bundle.characters) {
        await saveUserJsonFile(characterFileName, normalizeCharacterLibrary(bundle.characters));
    }
    if (bundle.outfits) {
        await saveUserJsonFile(outfitFileName, normalizeOutfitLibrary(bundle.outfits));
    }
    if (bundle.assets) {
        await saveUserJsonFile(assetFileName, normalizeAssetLibrary(bundle.assets));
    }
    if (bundle.cache) {
        await saveCacheIndex(dedupeCacheImages(bundle.cache.images || []));
    }
    if (bundle.memory) {
        await saveMemoryIndex(bundle.memory);
    }
    await hydrateBridgeAppData();
    setStatus('Bridge 备份导入完成');
}

function renderTransferPage(container) {
    const section = makeAppSection('导入导出', [
        makeAppButton('导出完整备份', () => exportBridgeBackup(true).catch(error => notifyError(error instanceof Error ? error.message : String(error)))),
        makeAppButton('仅导出配置', () => exportBridgeBackup(false).catch(error => notifyError(error instanceof Error ? error.message : String(error)))),
        makeAppButton('导入备份', () => document.getElementById('codex_image_bridge_backup_import_input')?.click()),
    ]);
    const info = document.createElement('div');
    info.className = 'codex-image-bridge-app-info';
    info.textContent = `完整备份包含设置、角色库、服装库、缓存索引、视觉记忆、其他库，以及 Bridge 图片文件。外部图片请先转存为 Bridge 参考图。`;
    const input = document.createElement('input');
    input.id = 'codex_image_bridge_backup_import_input';
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    input.addEventListener('change', function () {
        importBridgeBackupFile(this.files?.[0])
            .catch(error => notifyError(error instanceof Error ? error.message : String(error)))
            .finally(() => {
                this.value = '';
            });
    });
    section.append(info, input);
    container.append(section);
}

function renderBridgeAppPage(container) {
    switch (appActivePage) {
        case 'character-detail':
            renderCharacterDetailPage(container);
            break;
        case 'characters':
            renderCharacterLibraryPage(container);
            break;
        case 'outfits':
            renderOutfitLibraryPage(container);
            break;
        case 'cache':
            renderCacheLibraryPage(container);
            break;
        case 'assets':
            renderAssetLibraryPage(container);
            break;
        case 'settings':
            renderSettingsAppPage(container);
            break;
        case 'transfer':
            renderTransferPage(container);
            break;
        default:
            renderDashboardPage(container);
            break;
    }
}

function getBridgeAppZoom(settings = getSettings()) {
    return clampNumber(settings.appZoom, defaultSettings.appZoom, 0.8, 1.25);
}

function getBridgeAppOffset(settings, axis) {
    const limit = Math.max(160, Math.round((axis === 'x' ? window.innerWidth : window.innerHeight) * 0.42));
    const key = axis === 'x' ? 'appOffsetX' : 'appOffsetY';
    return clampNumber(settings[key], defaultSettings[key], -limit, limit);
}

function applyBridgeAppViewport(app = document.getElementById('codex_image_bridge_app')) {
    if (!app) {
        return;
    }
    const settings = getSettings();
    const zoom = getBridgeAppZoom(settings);
    const offsetX = getBridgeAppOffset(settings, 'x');
    const offsetY = getBridgeAppOffset(settings, 'y');
    app.style.setProperty('--cib-app-scale', String(zoom));
    app.style.setProperty('--cib-app-offset-x', `${offsetX}px`);
    app.style.setProperty('--cib-app-offset-y', `${offsetY}px`);
    const label = app.querySelector('[data-cib-app-zoom-label]');
    if (label) {
        label.textContent = `${Math.round(zoom * 100)}%`;
    }
}

function setBridgeAppZoom(value) {
    const settings = getSettings();
    settings.appZoom = getBridgeAppZoom({ appZoom: value });
    saveSettingsDebounced();
    applyBridgeAppViewport();
}

function adjustBridgeAppZoom(delta) {
    setBridgeAppZoom(getBridgeAppZoom() + delta);
}

function resetBridgeAppViewport() {
    const settings = getSettings();
    settings.appZoom = defaultSettings.appZoom;
    settings.appOffsetX = 0;
    settings.appOffsetY = 0;
    saveSettingsDebounced();
    applyBridgeAppViewport();
}

function handleBridgeAppPointerDown(event) {
    if (event.target.closest('button, input, textarea, select, a, label')) {
        return;
    }
    const app = document.getElementById('codex_image_bridge_app');
    if (!app) {
        return;
    }
    const settings = getSettings();
    bridgeAppDragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: getBridgeAppOffset(settings, 'x'),
        startOffsetY: getBridgeAppOffset(settings, 'y'),
    };
    app.classList.add('dragging');
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener('pointermove', handleBridgeAppPointerMove);
    document.addEventListener('pointerup', handleBridgeAppPointerUp, { once: true });
    document.addEventListener('pointercancel', handleBridgeAppPointerUp, { once: true });
}

function handleBridgeAppPointerMove(event) {
    if (!bridgeAppDragState || event.pointerId !== bridgeAppDragState.pointerId) {
        return;
    }
    const settings = getSettings();
    settings.appOffsetX = bridgeAppDragState.startOffsetX + event.clientX - bridgeAppDragState.startX;
    settings.appOffsetY = bridgeAppDragState.startOffsetY + event.clientY - bridgeAppDragState.startY;
    applyBridgeAppViewport();
}

function handleBridgeAppPointerUp(event) {
    if (!bridgeAppDragState || event.pointerId !== bridgeAppDragState.pointerId) {
        return;
    }
    document.removeEventListener('pointermove', handleBridgeAppPointerMove);
    document.removeEventListener('pointerup', handleBridgeAppPointerUp);
    document.removeEventListener('pointercancel', handleBridgeAppPointerUp);
    const settings = getSettings();
    settings.appOffsetX = Math.round(getBridgeAppOffset(settings, 'x'));
    settings.appOffsetY = Math.round(getBridgeAppOffset(settings, 'y'));
    saveSettingsDebounced();
    document.getElementById('codex_image_bridge_app')?.classList.remove('dragging');
    bridgeAppDragState = null;
    applyBridgeAppViewport();
}

function renderBridgeApp() {
    if (!floatingPanelOpen) {
        return;
    }

    $('#codex_image_bridge_app').remove();

    const app = document.createElement('div');
    app.id = 'codex_image_bridge_app';
    app.className = 'codex-image-bridge-app';
    app.dataset.theme = getBridgeAppTheme();

    const header = document.createElement('div');
    header.className = 'codex-image-bridge-app-header';
    const title = document.createElement('div');
    title.className = 'codex-image-bridge-app-title';
    title.innerHTML = '<strong>Codex Image Bridge</strong><span>ST 生图工作台</span>';
    const status = document.createElement('div');
    status.className = 'codex-image-bridge-app-status';
    status.textContent = document.getElementById('codex_image_bridge_status')?.textContent || '就绪';
    const viewport = document.createElement('div');
    viewport.className = 'codex-image-bridge-app-viewport';
    viewport.append(
        makeAppIconButton('fa-magnifying-glass-minus', '缩小界面', () => adjustBridgeAppZoom(-0.1)),
    );
    const zoomLabel = document.createElement('span');
    zoomLabel.dataset.cibAppZoomLabel = 'true';
    zoomLabel.textContent = `${Math.round(getBridgeAppZoom() * 100)}%`;
    viewport.append(
        zoomLabel,
        makeAppIconButton('fa-arrows-to-dot', '复位位置和缩放', resetBridgeAppViewport),
        makeAppIconButton('fa-magnifying-glass-plus', '放大界面', () => adjustBridgeAppZoom(0.1)),
    );
    const theme = document.createElement('div');
    theme.className = 'codex-image-bridge-app-theme';
    for (const [value, label] of [['auto', '跟随'], ['light', '亮色'], ['dark', '暗色']]) {
        theme.append(makeAppButton(label, () => {
            setSettingValue('uiTheme', value);
            renderBridgeApp();
        }, getBridgeAppTheme() === value ? 'active' : ''));
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'menu_button';
    close.title = '关闭';
    close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    close.addEventListener('click', closeFloatingPanel);
    header.addEventListener('pointerdown', handleBridgeAppPointerDown);
    header.append(title, status, viewport, theme, close);

    const shell = document.createElement('div');
    shell.className = 'codex-image-bridge-app-shell';
    const nav = document.createElement('nav');
    nav.className = 'codex-image-bridge-app-nav';
    const pages = [
        ['dashboard', '总览', 'fa-gauge-high'],
        ['characters', '角色库', 'fa-user'],
        ['outfits', '服装库', 'fa-shirt'],
        ['cache', '缓存库', 'fa-images'],
        ['assets', '其他库', 'fa-box-archive'],
        ['settings', '设置', 'fa-sliders'],
        ['transfer', '导入导出', 'fa-right-left'],
    ];
    for (const [key, label, icon] of pages) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = key === appActivePage || (key === 'characters' && appActivePage === 'character-detail') ? 'active' : '';
        button.innerHTML = `<i class="fa-solid ${icon}"></i><span>${label}</span>`;
        button.addEventListener('click', () => {
            appActivePage = key;
            renderBridgeApp();
        });
        nav.append(button);
    }

    const main = document.createElement('main');
    main.className = 'codex-image-bridge-app-main';
    renderBridgeAppPage(main);
    shell.append(nav, main);
    app.append(header, shell);
    document.body.append(app);
    applyBridgeAppViewport(app);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForResult(messageId, bridgeState) {
    const settings = getSettings();
    const timeoutMs = clampInteger(settings.resultTimeoutMs, defaultSettings.resultTimeoutMs, 60000, 604800000);
    const pollMs = clampInteger(settings.resultPollMs, defaultSettings.resultPollMs, 2000, 300000);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const message = chat[messageId];
        if (!message || message.extra?.codex_image_bridge?.status === 'succeeded') {
            return;
        }

        const result = await fetchResultFile(bridgeState.resultFile);
        const hasImages = normalizeResultImages(result).length > 0;
        if (result?.status === 'succeeded') {
            await attachImages(messageId, result, bridgeState, { final: true });
            return;
        }
        if (result?.status === 'processing' || result?.status === 'partial' || hasImages) {
            await attachImages(messageId, result, bridgeState, { final: false });
        }
        if (result?.status === 'failed') {
            if (hasImages) {
                setStatus(`已添加 ${normalizeResultImages(result).length} 张图，剩余生成失败，可稍后继续补完`);
                return;
            }
            await markBridgeJobFailed(messageId, bridgeState, result);
            return;
        }

        const countText = hasImages ? `，已收到 ${normalizeResultImages(result).length} 张` : '';
        setStatus(`等待 Codex 自动化: ${bridgeState.jobId}${countText}`);
        await delay(pollMs);
    }

    notifyError(`Codex job ${bridgeState.jobId} still has no result file`);
}

async function markBridgeJobFailed(messageId, bridgeState, result = {}) {
    const message = chat[messageId];
    if (!message) {
        return;
    }
    if (!message.extra || typeof message.extra !== 'object') {
        message.extra = {};
    }

    message.extra.codex_image_bridge = {
        ...bridgeState,
        status: 'failed',
        resultUpdatedAt: result.updatedAt || result.createdAt || '',
        failedAt: new Date().toISOString(),
        error: result.error || `Codex job ${bridgeState.jobId} failed`,
    };

    setStatus(`Codex 任务失败，已停止自动等待: ${message.extra.codex_image_bridge.error}`);
    updateMessageBlock(messageId, message);
    await saveChatConditional();
}

async function attachImages(messageId, result, bridgeState, { final = false } = {}) {
    const context = getContext();
    const currentChatId = context.chatId || context.getCurrentChatId?.() || '';
    if (bridgeState.chatId && currentChatId && bridgeState.chatId !== currentChatId) {
        notifyError(`聊天已切换，跳过 job ${bridgeState.jobId} 的自动插图`);
        return;
    }

    const message = chat[messageId];
    const resultImages = normalizeResultImages(result);
    if (!message || resultImages.length === 0) {
        return;
    }

    if (!message.extra || typeof message.extra !== 'object') {
        message.extra = {};
    }

    const attachedUrls = getAttachedBridgeImageUrls(message, bridgeState.jobId);
    const newImages = [];
    for (const image of resultImages) {
        const normalizedUrl = stripLeadingSlash(image.url);
        if (!normalizedUrl || attachedUrls.has(normalizedUrl)) {
            continue;
        }
        attachedUrls.add(normalizedUrl);
        newImages.push({ ...image, url: normalizedUrl });
    }

    removeBridgeMediaAttachments(message, bridgeState.jobId);
    message.extra.inline_image = true;
    const inlineImages = resultImages.map((image, index) => ({
        ...image,
        index: image.index || index + 1,
        displayId: normalizeBridgeImageDisplayId(image, bridgeState.jobId, index + 1),
        url: stripLeadingSlash(image.url),
        title: image.title || `Codex Image ${index + 1}`,
        kind: image.kind || 'narrative',
    }));
    message.extra.codex_image_bridge = {
        ...bridgeState,
        status: final ? 'succeeded' : 'processing',
        updatedAt: new Date().toISOString(),
        resultUpdatedAt: result.updatedAt || result.createdAt || '',
        completedAt: final ? new Date().toISOString() : bridgeState.completedAt,
        expectedImageCount: result.expectedImageCount || result.imageCount || bridgeState.expectedImageCount || bridgeState.imageCount || resultImages.length,
        imageCount: inlineImages.length,
        images: inlineImages,
        inlineImageDisplayIds: inlineImages.map(image => image.displayId).filter(Boolean),
        inlineImageUrls: inlineImages.map(image => stripLeadingSlash(image.url)),
    };
    message.mes = insertInlineBridgeImages(message.mes, inlineImages);

    if (newImages.length > 0) {
        try {
            await addImagesToCache(messageId, { ...result, images: newImages }, message.extra.codex_image_bridge);
        } catch (error) {
            notifyError(`图片已添加，但缓存索引保存失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    if (final) {
        try {
            await updateVisualMemory(messageId, result, message.extra.codex_image_bridge);
        } catch (error) {
            notifyError(`图片已添加，但视觉记忆保存失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    updateMessageBlock(messageId, message);
    syncBridgeMessageInlineClass(messageId);
    await saveChatConditional();
    setTimeout(() => scrollChatToBottom(), 100);
    setStatus(final
        ? `已添加 ${inlineImages.length} 张 Codex 图片`
        : `已流式添加 ${newImages.length} 张 Codex 图片，继续等待`);
    markActivityState(final ? 'job-completed' : 'job-partial', final ? {
        lastCompletedJob: {
            jobId: bridgeState.jobId,
            resultFile: bridgeState.resultFile,
            imageCount: inlineImages.length,
            completedAt: message.extra.codex_image_bridge.completedAt,
        },
    } : {
        pendingJob: {
            ...bridgeState,
            messageId,
            resultFile: bridgeState.resultFile,
            generatedCount: attachedUrls.size,
        },
    });
}

async function queueMessage(messageId, type) {
    const message = chat[messageId];
    if (!message || message.is_user || message.is_system || hasBridgeJob(message) || hasBridgeResult(message)) {
        return;
    }
    if (shouldIgnoreMessageForCleanup(message)) {
        return;
    }

    const job = await buildJob(messageId, type);
    if (!job.replyText) {
        return;
    }

    if (!message.extra || typeof message.extra !== 'object') {
        message.extra = {};
    }

    await uploadJobFile(job);
    message.extra.codex_image_bridge = {
        jobId: job.jobId,
        jobFile: job.jobFile,
        resultFile: job.resultFile,
        chatId: job.chatId,
        groupId: job.groupId,
        characterName: job.characterName,
        userName: job.userName,
        characterProfileId: job.characterProfileId,
        size: job.size,
        style: job.style,
        promptPreset: job.promptPreset,
        expectedImageCount: job.imageCount,
        visualMemoryCount: job.visualMemory.length,
        status: 'queued',
        queuedAt: new Date().toISOString(),
    };
    await writeActivityState('job-queued', {
        pendingJob: {
            jobId: job.jobId,
            jobFile: job.jobFile,
            resultFile: job.resultFile,
            chatId: job.chatId,
            messageId: job.messageId,
            characterName: job.characterName,
            createdAt: job.createdAt,
        },
    }).catch(error => {
        console.warn(`[${extensionName}] failed to write queued activity state`, error);
    });
    await saveChatConditional();
    if (getSettings().hideDirectiveMarkup) {
        const cleanedMessage = stripBridgeMarkup(message.mes);
        if (cleanedMessage !== message.mes) {
            message.mes = cleanedMessage || '（Codex 界面图片生成中）';
            updateMessageBlock(messageId, message);
            await saveChatConditional();
        }
    }
    setStatus(`已写入 Codex 任务文件: ${job.jobFile}`);
    waitForMessageResult(messageId, message.extra.codex_image_bridge);
}

async function waitForMessageResult(messageId, bridgeState) {
    if (runningMessages.has(messageId)) {
        return;
    }

    runningMessages.add(messageId);
    const messageElement = getMessageElement(messageId);
    messageElement.addClass('codex-image-bridge-pending');

    try {
        await waitForResult(messageId, bridgeState);
    } catch (error) {
        notifyError(error instanceof Error ? error.message : String(error));
    } finally {
        runningMessages.delete(messageId);
        messageElement.removeClass('codex-image-bridge-pending');
    }
}

async function handleMessageReceived(messageId, type) {
    if (!getSettings().enabled || !Number.isInteger(messageId)) {
        return;
    }

    try {
        await queueMessage(messageId, type);
    } catch (error) {
        notifyError(error instanceof Error ? error.message : String(error));
    }
}

function arraysEqualByValue(a = [], b = []) {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((value, index) => value === b[index]);
}

async function refreshCompletedResults({ force = false } = {}) {
    if (!getSettings().enabled || completedResultRefreshRunning) {
        return;
    }

    const now = Date.now();
    if (!force && now - lastCompletedResultRefresh < 15000) {
        return;
    }
    lastCompletedResultRefresh = now;
    completedResultRefreshRunning = true;

    try {
        const messageIds = [];
        for (let messageId = chat.length - 1; messageId >= 0 && messageIds.length < 25; messageId--) {
            const bridgeState = chat[messageId]?.extra?.codex_image_bridge;
            if (bridgeState?.resultFile && ['queued', 'processing', 'partial', 'succeeded', 'failed'].includes(bridgeState.status || '')) {
                messageIds.push(messageId);
            }
        }

        for (const messageId of messageIds) {
            if (runningMessages.has(messageId)) {
                continue;
            }

            const message = chat[messageId];
            const bridgeState = message?.extra?.codex_image_bridge;
            if (!bridgeState?.resultFile) {
                continue;
            }

            const result = await fetchResultFile(bridgeState.resultFile);
            const resultImages = normalizeResultImages(result);
            if (!result || resultImages.length === 0 || !['succeeded', 'processing', 'partial', 'failed'].includes(result.status)) {
                continue;
            }

            const resultUrls = resultImages.map(image => stripLeadingSlash(image.url));
            const resultDisplayIds = resultImages.map(image => image.displayId).filter(Boolean);
            const currentUrls = Array.isArray(bridgeState.inlineImageUrls) ? bridgeState.inlineImageUrls.map(stripLeadingSlash) : [];
            const currentDisplayIds = Array.isArray(bridgeState.inlineImageDisplayIds) ? bridgeState.inlineImageDisplayIds : [];
            const resultUpdatedAt = result.updatedAt || result.createdAt || '';
            const changed = !arraysEqualByValue(resultUrls, currentUrls)
                || !arraysEqualByValue(resultDisplayIds, currentDisplayIds)
                || (resultUpdatedAt && resultUpdatedAt !== bridgeState.resultUpdatedAt);

            if (changed) {
                await attachImages(messageId, result, bridgeState, { final: result.status === 'succeeded' });
            }
        }
    } catch (error) {
        notifyError(`刷新 Codex 已完成结果失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        completedResultRefreshRunning = false;
    }
}

function startCompletedResultRefreshTimer() {
    if (completedResultRefreshTimer) {
        return;
    }
    completedResultRefreshTimer = window.setInterval(() => {
        refreshCompletedResults().catch(error => notifyError(error instanceof Error ? error.message : String(error)));
    }, 15000);
}

function resumePendingJobs(options = {}) {
    const safeOptions = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const refreshCompleted = !!safeOptions.refreshCompleted;
    const force = !!safeOptions.force;
    if (!getSettings().enabled) {
        return;
    }

    for (let messageId = 0; messageId < chat.length; messageId++) {
        const bridgeState = chat[messageId]?.extra?.codex_image_bridge;
        if ((bridgeState?.status === 'queued' || bridgeState?.status === 'processing' || bridgeState?.status === 'partial') && bridgeState.resultFile) {
            waitForMessageResult(messageId, bridgeState);
        }
    }

    if (refreshCompleted) {
        refreshCompletedResults({ force }).catch(error => notifyError(error instanceof Error ? error.message : String(error)));
    }
}

function writeSettingsToUi() {
    const settings = getSettings();
    $('#codex_image_bridge_enabled').prop('checked', !!settings.enabled);
    $('#codex_image_bridge_fast_mode').prop('checked', !!settings.fastMode);
    $('#codex_image_bridge_use_worldbook_directives').prop('checked', !!settings.useWorldbookDirectives);
    $('#codex_image_bridge_render_media_blocks').prop('checked', !!settings.renderMediaBlocks);
    $('#codex_image_bridge_hide_directive_markup').prop('checked', !!settings.hideDirectiveMarkup);
    $('#codex_image_bridge_min_images').val(settings.minImages);
    $('#codex_image_bridge_max_images').val(settings.maxImages);
    $('#codex_image_bridge_size').val(settings.size);
    $('#codex_image_bridge_ui_theme').val(settings.uiTheme);
    $('#codex_image_bridge_style').val(settings.style);
    $('#codex_image_bridge_prompt_preset').val(settings.promptPreset);
    $('#codex_image_bridge_context_messages').val(settings.contextMessages);
    $('#codex_image_bridge_memory_items').val(settings.memoryItems);
    $('#codex_image_bridge_memory_entries').val(settings.memoryEntries);
    $('#codex_image_bridge_memory_max_chars').val(settings.memoryMaxChars);
    $('#codex_image_bridge_character_reference_count').val(settings.characterReferenceCount);
    $('#codex_image_bridge_poll_ms').val(settings.resultPollMs);
    $('#codex_image_bridge_timeout_ms').val(settings.resultTimeoutMs);
    $('#codex_image_bridge_automation_active_minutes').val(settings.automationActiveMinutes);
    $('#codex_image_bridge_floating_button_enabled').prop('checked', !!settings.floatingButton);
    $('#codex_image_bridge_prompt_template').val(settings.promptTemplate);
}

function readSettingInput(input) {
    if (input.type === 'checkbox') {
        return input.checked;
    }
    if (input.type === 'number') {
        const key = input.dataset.codexImageBridgeSetting || input.dataset.cibAppSetting || '';
        const fallback = Number(input.defaultValue || defaultSettings[key] || input.min || 0);
        return clampInteger(input.value, fallback, Number(input.min || 0), Number(input.max || Number.MAX_SAFE_INTEGER));
    }
    return input.value;
}

function bindSettingsUi() {
    $('#codex_image_bridge_settings [data-codex-image-bridge-setting]').on('input change', function () {
        const key = this.dataset.codexImageBridgeSetting;
        getSettings()[key] = readSettingInput(this);
        saveSettingsDebounced();
        scheduleActivityState('settings-updated');
        syncFloatingUi();
    });

    $('#codex_image_bridge_resume').on('click', () => {
        markActivityState('manual-resume');
        resumePendingJobs({ refreshCompleted: true, force: true });
        setStatus('已重新检查等待中和已完成的结果文件');
    });
}

async function loadSettingsUi() {
    if ($('#codex_image_bridge_settings').length) {
        return;
    }

    const html = await (await fetch(settingsUrl)).text();
    $('#extensions_settings').append(html);
    collapseSettingsDrawer();
    writeSettingsToUi();
    bindSettingsUi();
    bindCharacterLibraryUi();
    bindCacheUi();
    refreshCharacterLibrary().catch(error => notifyError(error instanceof Error ? error.message : String(error)));
    refreshCache({ syncServer: true }).catch(error => notifyError(error instanceof Error ? error.message : String(error)));
    syncFloatingUi();
}

jQuery(async () => {
    getSettings();
    await loadSettingsUi();
    markActivityState('extension-loaded');
    $(document).off('click.codexImageBridgeInlineImage').on('click.codexImageBridgeInlineImage', '#chat .mes_text img[src*="codex-image-bridge"]', function (event) {
        event.preventDefault();
        event.stopPropagation();
        showInlineBridgeImagePreview(this);
    });
    eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        markActivityState('chat-changed');
        ensureInlineImagesForBridgeMessages().catch(error => notifyError(error instanceof Error ? error.message : String(error)));
        syncBridgeMessageInlineClasses();
        resumePendingJobs({ refreshCompleted: true, force: true });
    });
    eventSource.on(event_types.MESSAGE_UPDATED, resumePendingJobs);
    eventSource.on(event_types.MESSAGE_EDITED, resumePendingJobs);
    eventSource.on(event_types.MESSAGE_SWIPED, resumePendingJobs);
    eventSource.on(event_types.APP_READY, () => {
        markActivityState('app-ready');
        ensureInlineImagesForBridgeMessages().catch(error => notifyError(error instanceof Error ? error.message : String(error)));
        syncBridgeMessageInlineClasses();
        resumePendingJobs({ refreshCompleted: true, force: true });
    });
    ensureInlineImagesForBridgeMessages().catch(error => notifyError(error instanceof Error ? error.message : String(error)));
    syncBridgeMessageInlineClasses();
    startCompletedResultRefreshTimer();
});
