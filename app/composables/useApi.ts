import type { CatalogResponse, DeleteResult, FilePreview, QuarantineResult, RestoreResult, SkillDetail } from '#shared/types/catalog'
import { toApiError } from '~/utils/api-error'

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT'
  body?: Record<string, unknown>
  query?: Record<string, string>
}

/** Spec §11.2: one `$fetch.create` with the session token; `{ error }` bodies become ApiError. */
export function useApi() {
  const config = useRuntimeConfig()
  const client = $fetch.create({
    headers: { 'X-Shelfware-Token': String(config.public.shelfwareToken ?? '') },
  })

  async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
    try {
      // `$fetch`'s TypedInternalResponse cannot narrow to a caller-supplied generic.
      return await client<T>(path, options) as T
    } catch (err) {
      throw toApiError(err)
    }
  }

  return {
    catalog: (refresh = false) => call<CatalogResponse>(refresh ? '/api/skills?refresh=1' : '/api/skills'),
    skill: (id: string) => call<SkillDetail>(`/api/skills/${id}`),
    file: (id: string, rel: string) => call<FilePreview>(`/api/skills/${id}/file`, { query: { path: rel } }),
    save: (id: string, source: string, baseHash: string) =>
      call<SkillDetail>(`/api/skills/${id}`, { method: 'PUT', body: { source, baseHash } }),
    quarantine: (ids: string[]) => call<QuarantineResult>('/api/skills/quarantine', { method: 'POST', body: { ids } }),
    restore: (ids: string[]) => call<RestoreResult>('/api/skills/restore', { method: 'POST', body: { ids } }),
    remove: (ids: string[]) => call<DeleteResult>('/api/skills/delete', { method: 'POST', body: { ids } }),
  }
}

export type Api = ReturnType<typeof useApi>
