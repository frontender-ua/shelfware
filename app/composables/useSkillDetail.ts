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
      return
    }
    loading.value = true
    try {
      detail.value = await api.skill(id.value)
    } catch (err) {
      detail.value = null
      error.value = (err as Error).message
    } finally {
      loading.value = false
    }
  }

  async function openFile(rel: string): Promise<void> {
    if (!id.value) return
    previewError.value = ''
    try {
      preview.value = await api.file(id.value, rel)
    } catch (err) {
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

  async function reload(): Promise<SkillDetail | null> {
    await load()
    return detail.value
  }

  watch(id, load, { immediate: true })

  return { detail, error, loading, preview, previewError, load, openFile, save, reload }
}
