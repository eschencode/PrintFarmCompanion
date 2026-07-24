import type { PageServerLoad, Actions } from './$types';
import { requireCtx } from '$lib/server/context';
import { getPiConfigSummary, savePiConfig, testPiConnection } from '$lib/server/pi';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);
  const piConfig = await getPiConfigSummary(ctx);
  return { piConfig };
};

export const actions: Actions = {
  savePiConfig: async ({ request, locals }) => {
    const ctx = requireCtx(locals);
    const form = await request.formData();
    const tunnelUrl = ((form.get('tunnelUrl') as string) || '').trim();
    const piSecret = ((form.get('piSecret') as string) || '').trim();
    if (!tunnelUrl) return fail(400, { error: 'Tunnel URL is required' });

    const result = await savePiConfig(ctx, { tunnelUrl, piSecret });
    if (!result.success) return fail(400, { error: result.error });
    return { saved: true };
  },

  testPiConnection: async ({ locals }) => {
    const ctx = requireCtx(locals);
    const result = await testPiConnection(ctx);
    return { tested: true, success: result.success, error: result.error };
  },
};
