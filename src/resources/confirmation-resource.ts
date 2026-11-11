// トークンは本文（contents[0].text）に載せる。ホストが結果 `_meta` を iframe に渡さなくなったため（ADR-0007 の 2026-11-11 追記）。
// 渡す条件は get_ui_snapshot の `_meta` とまったく同じにする。条件を満たさなければ、内容もトークンも返さない。

import { log } from '../../lib/logger.js';
import { appResourceUriFor, readConfirmationMeta } from '../mcp-apps-meta.js';
import { clientSupportsElicitation, isAppUiExecuteAllowed } from '../private/elicitation.js';
import type { ToolHandlerExtra } from '../tool-definition.js';
import { getUiSnapshot, getUiSnapshotMeta } from '../ui-snapshot-cache.js';
import { appResourceRegistry } from './app-resources.js';

export interface ConfirmationResourceResult {
	[key: string]: unknown;
	contents: Array<{ uri: string; mimeType: string; text: string }>;
}

export function readConfirmationResource(
	uri: string,
	app: unknown,
	extra: ToolHandlerExtra | undefined,
): ConfirmationResourceResult {
	const appUri = typeof app === 'string' ? appResourceUriFor(app) : undefined;
	const known = appUri != null && appResourceRegistry.some((r) => r.uri === appUri);
	const sessionId = (extra as { sessionId?: string } | undefined)?.sessionId;
	const allowed = known && isAppUiExecuteAllowed(extra) && !clientSupportsElicitation(extra);
	const structuredContent = allowed ? getUiSnapshot(appUri, { sessionId }) : null;
	const confirmation =
		allowed && structuredContent ? readConfirmationMeta(getUiSnapshotMeta(appUri, { sessionId })) : undefined;
	// トークンそのものは記録しない。実機で「カードが読んだか・渡したか」を確かめるための記録。
	log('info', {
		type: 'confirmation_resource_read',
		app: typeof app === 'string' ? app : null,
		delivered: !!confirmation,
	});
	const body = confirmation ? { structuredContent, confirmation } : {};
	return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(body) }] };
}
