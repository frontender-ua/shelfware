import type { DeleteEffect, Physicality } from '#shared/types/catalog'

export interface DeleteEffectInput {
  path: string
  link?: boolean
  file?: boolean
  linkTarget?: string
  physicality?: Physicality
}

/**
 * The filesystem-effect rule (spec §11.7, upstream delete-effect.js): each
 * card names unlink, delete file, or delete folder. Auto-imported in both the
 * app and the server context.
 */
export function deleteEffect(skill: DeleteEffectInput): DeleteEffect {
  if (skill.link) {
    if (skill.physicality === 'broken') {
      return { action: 'unlink', label: 'Unlink', path: skill.path, note: 'The target is already gone' }
    }
    return {
      action: 'unlink',
      label: 'Unlink',
      path: skill.path,
      note: skill.linkTarget ? `Target ${skill.linkTarget} stays` : 'The target stays',
    }
  }
  if (skill.file) {
    return { action: 'delete-file', label: 'Delete file', path: skill.path, note: '' }
  }
  return { action: 'delete-folder', label: 'Delete folder', path: skill.path, note: '' }
}
