import type { Ref } from 'vue'
import type { FilePreview, SkillDetail } from '#shared/types/catalog'

/** Spec §11.2: detail fetch, file preview, save and reload for one card id. */
export function useSkillDetail(id: Ref<string | undefined>) {
  const api = useApi()
  const detail = ref<SkillDetail | null>(null)
  const error = ref('')
  const loading = ref(false)
  const preview = ref<FilePreview | null>(null)
  const previewError = ref('')

  async function load(): Promise<void> {
    preview.value = null
    previewError.value = ''
    error.value = ''
    if (!id.value) {
      detail.value = null
      loading.value = false
      return
    }
    // Fast j/k navigation overlaps requests: only the newest id may write the state.
    const requested = id.value
    loading.value = true
    try {
      const fresh = await api.skill(requested)
      if (id.value === requested) detail.value = fresh
    } catch (err) {
      if (id.value === requested) {
        detail.value = null
        error.value = (err as Error).message
      }
    } finally {
      if (id.value === requested) loading.value = false
    }
  }

  async function openFile(rel: string): Promise<void> {
    if (!id.value) return
    const requested = id.value
    previewError.value = ''
    try {
      const fresh = await api.file(requested, rel)
      if (id.value === requested) preview.value = fresh
    } catch (err) {
      if (id.value !== requested) return
      preview.value = null
      previewError.value = (err as Error).message
    }
  }

  async function save(source: string, baseHash: string): Promise<SkillDetail> {
    if (!id.value) throw new Error('No card selected')
    const fresh = await api.save(id.value, source, baseHash)
    detail.value = fresh
    return fresh
  }

  /**
   * Unlike `load`, a failed reload leaves `detail` and `error` alone and rethrows: the editor
   * holds unsaved text, and blanking the detail would unmount it along with the user's draft.
   */
  async function reload(): Promise<SkillDetail | null> {
    if (!id.value) return null
    const requested = id.value
    const fresh = await api.skill(requested)
    if (id.value !== requested) return null
    detail.value = fresh
    return fresh
  }

  watch(id, load, { immediate: true })

  return { detail, error, loading, preview, previewError, load, openFile, save, reload }
}
