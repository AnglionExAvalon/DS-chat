import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import {
  dismissOccupied,
  resolveConflicts,
  takeOverSync,
  useSync,
} from '../../services/sync.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import styles from './StartupSync.module.css'

/**
 * 启动过渡：检查云端期间覆盖整个界面，避免露出半加载状态。
 * 单侧有改动时直接对齐、不再询问；只有租约被占或两边都改过才停下来。
 */
export const StartupSync = () => {
  const t = useTranslate()
  const stage = useSync((state) => state.startup)
  const busy = useSync((state) => state.busy)
  const deviceName = useSync((state) => state.lease?.deviceName ?? '')
  const conflicts = useSync((state) => state.conflicts)

  if (stage === 'checking' || stage === 'syncing') {
    return createPortal(
      <div className={styles.overlay} role="status" aria-live="polite">
        <div className={styles.content}>
          <span className={styles.spinner} />
          <span className={styles.text}>
            {t(stage === 'syncing' ? 'startupSyncing' : 'startupChecking')}
          </span>
        </div>
      </div>,
      document.body
    )
  }

  if (stage === 'occupied') {
    return (
      <Modal
        title={t('startupOccupiedTitle')}
        closable
        onClose={dismissOccupied}
        footer={
          <>
            <Button variant="outlined" size="m" onClick={dismissOccupied}>
              {t('startupLater')}
            </Button>
            <Button size="m" disabled={busy !== null} onClick={() => void takeOverSync()}>
              {t('startupOccupiedTakeOver')}
            </Button>
          </>
        }
      >
        {t('startupOccupiedBody', {
          device: deviceName || t('startupOccupiedUnknownDevice'),
        })}
      </Modal>
    )
  }

  if (stage === 'conflict') {
    return (
      <Modal
        title={t('startupConflictTitle')}
        closable
        onClose={() => resolveConflicts('local')}
        footer={
          <>
            <Button
              variant="outlined"
              size="m"
              disabled={busy !== null}
              onClick={() => resolveConflicts('remote')}
            >
              {t('startupConflictRemote')}
            </Button>
            <Button size="m" disabled={busy !== null} onClick={() => resolveConflicts('local')}>
              {t('startupConflictLocal')}
            </Button>
          </>
        }
      >
        {t('startupConflictBody', { count: conflicts.length })}
      </Modal>
    )
  }

  return null
}