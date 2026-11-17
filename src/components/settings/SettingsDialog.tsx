import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  IconDarkOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
  IconSettingsOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import {
  BackupError,
  clearHistory,
  exportHistory,
  importHistory,
} from '../../services/chat/backup.js'
import { useIsMobile } from '../../app/viewport.js'
import { useChatStore } from '../../services/chat/store.js'
import { clearLocalData } from '../../services/reset.js'
import { regionCodes, getRegionName, provinces } from '../../services/location.js'
import {
  ensurePersistentStorage,
  readLastExport,
  readStorageStatus,
  type StorageStatus,
} from '../../services/storage.js'
import {
  clearSyncError,
  connectSync,
  createSyncCode,
  disconnectSync,
  formatSyncCode,
  openSyncConflict,
  pullFromCloud,
  pushToCloud,
  setAutoSync,
  takeOverSync,
  useSync,
} from '../../services/sync.js'
import {
  isChineseBrowser,
  setLocale,
  setLocation,
  setThemePreference,
  setTtsVoice,
  useSettings,
  type ThemePreference,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import { formatBytes } from '../../utils/format.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { ApiKeyConfirm, ApiKeyField, useApiKeyEditor } from './ApiKeyField.js'
import { closeSettings, useSettingsDialog, type SettingsSection } from './settingsDialogState.js'
import styles from './Settings.module.css'

/**
 * 设置弹窗：分「通用设置」（主题、语言、朗读音色、位置）与「数据管理」（API Key、导入、导出、删除）。
 * 桌面端为居中弹窗、左侧导航；移动端为底部弹层、导航横排在内容上方
 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  return open ? <SettingsContent /> : null
}

const sections: { value: SettingsSection; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'general',
    label: 'settingDialogAsideGeneralOptionLabel',
    icon: <IconSettingsOutline16 />,
  },
  { value: 'data', label: 'settingDialogAsideDataOptionLabel', icon: <IconDataOutline16 /> },
]

const SettingsContent = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  // 打开时按调用方指定的分组选中，之后在弹窗内切换
  const [section, setSection] = useState(() => useSettingsDialog.getState().section)
  // 切换分组不丢失正在输入的 API Key 与导入状态
  const apiKeyEditor = useApiKeyEditor()
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const replacingHistory = useChatStore((state) => state.importingHistory)
  const historyBusy = historyImport.busy || historyDelete.busy || replacingHistory
  return (
    <>
      <Modal
        title={t('settings')}
        closable
        className={styles.dialog}
        mainClassName={styles.dialogMain}
        onClose={() => {
          if (!historyDelete.busy) {
            closeSettings()
          }
        }}
      >
        <div role="tablist" className={styles.navigation}>
          {sections.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={section === item.value}
              className={clsx(styles.navItem, section === item.value && styles.navItemActive)}
              onClick={() => setSection(item.value)}
            >
              {item.icon}
              {t(item.label)}
            </button>
          ))}
        </div>
        <div role="tabpanel" className={styles.content}>
          {section === 'general' ? (
            <>
              <ThemeSetting />
              <LocaleSetting />
              <TtsVoiceSetting />
              <LocationSetting />
            </>
          ) : (
            <>
              <ApiKeyField editor={apiKeyEditor} />
              <ImportHistory historyImport={historyImport} disabled={historyBusy} />
              <ExportHistory disabled={historyBusy} />
              <StorageStatusCell />
              <SyncSection />
              <SettingCell
                label={t('deleteAllSessions')}
                status={null}
                action={
                  <Button
                    variant="dangerOutlined"
                    size="m"
                    className={styles.cellButton}
                    disabled={historyBusy}
                    onClick={historyDelete.open}
                  >
                    {t('delete')}
                  </Button>
                }
              />
              <ClearAllLocal disabled={historyBusy} />
              {isMobile ? <ApiKeyConfirm editor={apiKeyEditor} /> : null}
            </>
          )}
        </div>
      </Modal>
      {historyImport.file ? <ImportConfirm historyImport={historyImport} /> : null}
      {historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
    </>
  )
}

/** 删除确认保留在设置之上；失败可重试，成功只关闭确认弹窗。 */
const DeleteAllConfirm = ({
  historyDelete,
}: {
  historyDelete: ReturnType<typeof useHistoryDelete>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('deleteAllSessionsModalTitle')}
      className={styles.deleteConfirm}
      onClose={historyDelete.cancel}
      footer={
        <div className={styles.deleteActions} aria-busy={historyDelete.busy}>
          <Button
            variant="outlined"
            autoFocus
            disabled={historyDelete.busy}
            onClick={historyDelete.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={historyDelete.busy}
            onClick={() => void historyDelete.confirm()}
          >
            {t(historyDelete.busy ? 'historyDeleting' : 'deleteAllSessions')}
          </Button>
        </div>
      }
    >
      {t('deleteAllSessionsModalDescription')}
    </Modal>
  )
}

const useHistoryDelete = () => {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)

  const confirm = async () => {
    if (deleting.current) {
      return
    }
    deleting.current = true
    setBusy(true)
    try {
      await clearHistory()
      setOpened(false)
      showToast({ key: 'historyDeleted' })
    } catch {
      showToast({ key: 'historyDeleteFailed', type: 'error' })
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  return {
    opened,
    busy,
    open: () => setOpened(true),
    cancel: () => {
      if (!deleting.current) {
        setOpened(false)
      }
    },
    confirm,
  }
}

const LocationSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const location = useSettings((state) => state.location)
  const province =
    location?.region === 'CN'
      ? provinces.find((item) => item.code === location.province)
      : undefined

  return (
    <SettingCell
      label={t('settingsLocation')}
      status={null}
      className={styles.locationCell}
      action={
        <div className={styles.locationSelectors}>
          {isChineseBrowser() ? (
            <>
              <Select
                ariaLabel={t('settingsLocationProvince')}
                className={styles.provinceSelect}
                value={province?.code ?? ''}
                placeholder={t('settingsLocationProvince')}
                options={provinces.map((item) => ({ value: item.code, label: item.name }))}
                onChange={(value) => {
                  if (value !== province?.code) {
                    setLocation({ region: 'CN', province: value })
                  }
                }}
              />
              <Select
                ariaLabel={t('settingsLocationCity')}
                className={styles.citySelect}
                value={province ? (location?.city ?? '') : ''}
                disabled={!province?.cities.length}
                placeholder={t('settingsLocationCity')}
                options={
                  province?.cities.map((item) => ({ value: item.code, label: item.name })) ?? []
                }
                onChange={(value) => {
                  if (province) {
                    setLocation({ region: 'CN', province: province.code, city: value })
                  }
                }}
              />
            </>
          ) : (
            <Select
              ariaLabel={t('settingsLocationRegion')}
              className={styles.regionSelect}
              value={location?.region ?? ''}
              placeholder={t('settingsLocationRegion')}
              options={regionCodes
                .map((code) => ({ value: code, label: getRegionName(code, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))}
              onChange={(value) => setLocation({ region: value })}
            />
          )}
        </div>
      }
    />
  )
}

const LocaleSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  return (
    <SettingCell
      label={t('settingsLocalePreference')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsLocalePreference')}
          value={locale}
          options={[
            { value: 'zh-CN', label: t('settingsLocaleZhCN'), lang: 'zh-CN' },
            { value: 'en-US', label: t('settingsLocaleEnUS'), lang: 'en' },
          ]}
          onChange={setLocale}
        />
      }
    />
  )
}

/** 朗读音色：stella（海星，女声）/ tide（暗潮，男声） */
const TtsVoiceSetting = () => {
  const t = useTranslate()
  const ttsVoice = useSettings((state) => state.ttsVoice)
  return (
    <SettingCell
      label={t('settingsTtsVoice')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsTtsVoice')}
          value={ttsVoice}
          options={[
            { value: 'stella', label: t('settingsTtsVoiceStella') },
            { value: 'tide', label: t('settingsTtsVoiceTide') },
          ]}
          onChange={setTtsVoice}
        />
      }
    />
  )
}

/** 覆盖导入的二次确认，叠在设置弹窗上 */
const ImportConfirm = ({
  historyImport,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('historyImportConfirmTitle')}
      className={styles.importConfirm}
      onClose={historyImport.cancel}
      footer={
        <>
          <Button variant="outlined" size="m" autoFocus onClick={historyImport.cancel}>
            {t('cancel')}
          </Button>
          <Button variant="dangerOutlined" size="m" onClick={() => void historyImport.confirm()}>
            {t('historyImportConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.importConfirmText}>{t('historyImportConfirmDescription')}</div>
    </Modal>
  )
}

const themeOptions: { value: ThemePreference; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'avatarMenuSettingsDialogThemeSelectLightOption',
    icon: <IconLightOutline16 />,
  },
  {
    value: 'dark',
    label: 'avatarMenuSettingsDialogThemeSelectDarkOption',
    icon: <IconDarkOutline16 />,
  },
  {
    value: 'system',
    label: 'avatarMenuSettingsDialogThemeSelectSystemOption',
    icon: <IconFollowsystemOutline16 />,
  },
]

/**
 * 主题项：标题下方浅色 / 深色 / 跟随系统三个选块。
 * 与下方语言选项连续排列。
 */
const ThemeSetting = () => {
  const t = useTranslate()
  const themePreference = useSettings((state) => state.themePreference)
  const label = t('avatarMenuSettingsDialogThemeItemLabel')
  return (
    <div className={styles.theme}>
      {label}
      <div role="radiogroup" aria-label={label} className={styles.themeOptions}>
        {themeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={themePreference === option.value}
            className={clsx(
              styles.themeOption,
              themePreference === option.value && styles.themeOptionSelected
            )}
            onClick={() => setThemePreference(option.value)}
          >
            {option.icon}
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** `reason` 为失败原因的文案 key，展示时按当前语言翻译后填入 `message` 参数。 */
type Status = (TranslationMessage & { error?: boolean; reason?: TranslationKey }) | null

/** 导出失败附带原因：预期的错误用对应文案作原因，其他错误用错误信息。 */
const errorStatus = (key: TranslationKey, error: unknown): Status => ({
  key,
  ...(error instanceof BackupError
    ? { reason: error.key }
    : { params: { message: error instanceof Error ? error.message : String(error) } }),
  error: true,
})

const SettingCell = ({
  label,
  description,
  status,
  action,
  className,
}: {
  label: string
  description?: string
  status: Status
  action: ReactNode
  className?: string
}) => {
  const t = useTranslate()
  return (
    <div className={clsx(styles.cell, styles.row, className)}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {status || description ? (
          <div className={clsx(styles.description, status?.error && styles.error)}>
            {status
              ? t(status.key, status.reason ? { message: t(status.reason) } : status.params)
              : description}
          </div>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/** 选文件后先提示覆盖；确认后才检查文件并执行导入，任何错误都提示导入失败。 */
const useHistoryImport = () => {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const importing = useRef(false)

  const confirm = async () => {
    if (!file || importing.current) {
      return
    }
    importing.current = true
    setFile(null)
    setBusy(true)
    setStatus(null)
    try {
      const count = await importHistory(file)
      setStatus({ key: count === 1 ? 'historyImportedOne' : 'historyImported', params: { count } })
    } catch {
      setStatus({ key: 'historyImportFailed', error: true })
    } finally {
      importing.current = false
      setBusy(false)
    }
  }

  return { file, busy, status, select: setFile, cancel: () => setFile(null), confirm }
}

/** 导入 = 覆盖：用选中文件替换本地全部会话与附件。 */
const ImportHistory = ({
  historyImport,
  disabled,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
  disabled: boolean
}) => {
  const t = useTranslate()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <SettingCell
      label={t('historyImport')}
      description={t('historyImportDescription')}
      status={historyImport.status}
      action={
        <>
          <Button
            variant="outlined"
            size="m"
            className={clsx(styles.cellButton, styles.uploadButton)}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <IconUploadOutline14 />
            {t('upload')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                historyImport.select(file)
              }
            }}
          />
        </>
      }
    />
  )
}

/** 上次导出的相对时间文案；没有记录时提示尚未导出 */
const exportedWhen = (t: ReturnType<typeof useTranslate>, time: number | null): string => {
  if (time === null) {
    return t('lastExportNever')
  }
  const days = Math.floor((Date.now() - time) / 86_400_000)
  const when =
    days <= 0
      ? t('relativeToday')
      : days === 1
        ? t('relativeYesterday')
        : t('relativeDaysAgo', { count: days })
  return t('lastExport', { when })
}

/** 将全部会话及图片导出为 ZIP 文件并下载 */
const ExportHistory = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const empty = useChatStore((state) => state.sessions.length === 0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [lastExport, setLastExport] = useState(() => readLastExport())

  const onExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { name, blob } = await exportHistory()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setLastExport(Date.now())
    } catch (error) {
      setStatus(errorStatus('historyExportFailed', error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingCell
      label={t('exportAllLabel')}
      description={`${t('historyExportDescription')} · ${exportedWhen(t, lastExport)}`}
      status={status}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={disabled || busy || empty}
          onClick={() => void onExport()}
        >
          <IconDownloadOutline16 />
          {t('exportAllDownload')}
        </Button>
      }
    />
  )
}

/** 本地存储：持久化状态、已用空间，未获得持久化时可手动申请 */
const StorageStatusCell = () => {
  const t = useTranslate()
  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setStorage(await readStorageStatus())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const request = async () => {
    setBusy(true)
    try {
      const granted = await ensurePersistentStorage()
      await refresh()
      showToast(
        granted
          ? { key: 'storageRequested' }
          : { key: 'storageRequestFailed', type: 'error' }
      )
    } finally {
      setBusy(false)
    }
  }

  if (storage === null) {
    return (
      <SettingCell
        label={t('storageTitle')}
        status={null}
        description={t('storageChecking')}
        action={null}
      />
    )
  }

  // persisted 为 null 表示浏览器没有 StorageManager，无法申请
  const supported = storage.persisted !== null
  const description = !supported
    ? t('storageUnsupported')
    : storage.persisted
      ? `${t('storagePersisted')} · ${t('storageUsage', {
          usage: formatBytes(storage.usage),
          quota: formatBytes(storage.quota),
        })}`
      : t('storageNotPersisted')

  return (
    <SettingCell
      label={t('storageTitle')}
      status={null}
      description={description}
      action={
        supported && !storage.persisted ? (
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            disabled={busy}
            onClick={() => void request()}
          >
            {t('storageRequest')}
          </Button>
        ) : null
      }
    />
  )
}

/** 云同步：生成/输入同步码；已连接时提供上传、恢复与断开 */
const SyncSection = () => {
  const t = useTranslate()
  const code = useSync((state) => state.code)
  const connected = useSync((state) => state.connected)
  const busy = useSync((state) => state.busy)
  const lastSyncAt = useSync((state) => state.lastSyncAt)
  const error = useSync((state) => state.error)
  const errorDetail = useSync((state) => state.errorDetail)
  const auto = useSync((state) => state.auto)
  const conflict = useSync((state) => state.conflict)
  const pending = useSync((state) => state.pending)
  const lease = useSync((state) => state.lease)
  const takenOver = useSync((state) => state.takenOver)
  const [input, setInput] = useState('')
  const [confirm, setConfirm] = useState<'push' | 'pull' | null>(null)

  // 服务端错误原文优先展示，方便直接看出是权限、请求过大还是网络问题
  const status: Status = error
    ? errorDetail
      ? { key: 'syncFailedWithDetail', params: { detail: errorDetail }, error: true }
      : { key: error, error: true }
    : null

  const copyCode = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showToast({ key: 'syncCopied' })
    } catch {
      showToast({ key: 'copyFailed', type: 'error' })
    }
  }

  const generate = () => {
    setInput(formatSyncCode(createSyncCode()))
    clearSyncError()
  }

  const run = async (action: 'push' | 'pull') => {
    setConfirm(null)
    try {
      const count = action === 'push' ? await pushToCloud() : await pullFromCloud()
      showToast({ key: action === 'push' ? 'syncUploaded' : 'syncPulled', params: { count } })
    } catch {
      // 失败原因已写入 store，由 status 展示
    }
  }

  if (!code) {
    return (
      <SettingCell
        label={t('syncTitle')}
        description={t('syncDescription')}
        status={status}
        className={styles.syncCell}
        action={
          <div className={styles.syncForm}>
            <input
              className={styles.syncInput}
              value={input}
              placeholder={t('syncCodePlaceholder')}
              spellCheck={false}
              onChange={(event) => {
                setInput(event.target.value)
                clearSyncError()
              }}
            />
            <Button variant="outlined" size="m" onClick={generate}>
              {t('syncGenerate')}
            </Button>
            <Button
              size="m"
              disabled={busy !== null || input.trim().length < 8}
              onClick={() => void connectSync(input)}
            >
              {t('syncConnect')}
            </Button>
          </div>
        }
      />
    )
  }

  const whenText =
    lastSyncAt === null
      ? t('syncConnectedNever')
      : t('syncConnectedAt', { when: exportedWhen(t, lastSyncAt) })

  return (
    <>
      <SettingCell
        label={t('syncTitle')}
        description={`${formatSyncCode(code)} · ${whenText}${pending ? ` · ${t('syncPending')}` : ''}`}
        status={status}
        className={styles.syncCell}
        action={
          <div className={styles.syncForm}>
            <Button
              variant="outlined"
              size="m"
              disabled={busy !== null}
              onClick={() => void copyCode(formatSyncCode(code))}
            >
              {t('copy')}
            </Button>
            <Button
              variant="outlined"
              size="m"
              disabled={busy !== null || !connected}
              onClick={() => setConfirm('push')}
            >
              {t('syncPush')}
            </Button>
            <Button
              size="m"
              disabled={busy !== null || !connected}
              onClick={() => setConfirm('pull')}
            >
              {t('syncPull')}
            </Button>
            <Button
              variant="dangerOutlined"
              size="m"
              disabled={busy !== null}
              onClick={() => disconnectSync()}
            >
              {t('syncDisconnect')}
            </Button>
          </div>
        }
      />
      <SettingCell
        label={t('syncAuto')}
        description={t('syncAutoDescription')}
        status={conflict ? { key: 'syncConflict', error: true } : null}
        action={
          <div className={styles.syncForm}>
            {conflict ? (
              <Button variant="outlined" size="m" onClick={openSyncConflict}>
                {t('syncConflictResolve')}
              </Button>
            ) : null}
            <Button
              variant="outlined"
              size="m"
              className={styles.cellButton}
              disabled={busy !== null}
              onClick={() => setAutoSync(!auto)}
            >
              {t(auto ? 'syncAutoOn' : 'syncAutoOff')}
            </Button>
          </div>
        }
      />
      {connected ? (
        <SettingCell
          label={t('syncDevice')}
          description={t('syncLeaseSelf')}
          status={
            takenOver
              ? {
                  key: 'syncLeaseOther',
                  params: { device: lease?.deviceName || t('startupOccupiedUnknownDevice') },
                  error: true,
                }
              : null
          }
          action={
            takenOver ? (
              <Button
                variant="outlined"
                size="m"
                className={styles.cellButton}
                disabled={busy !== null}
                onClick={() => void takeOverSync()}
              >
                {t('syncLeaseTakeOver')}
              </Button>
            ) : null
          }
        />
      ) : null}
      {confirm ? (
        <Modal
          title={t(confirm === 'push' ? 'syncPushConfirmTitle' : 'syncPullConfirmTitle')}
          className={styles.importConfirm}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button variant="outlined" size="m" onClick={() => setConfirm(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant={confirm === 'pull' ? 'danger' : 'primary'}
                size="m"
                onClick={() => void run(confirm)}
              >
                {t('syncConfirm')}
              </Button>
            </>
          }
        >
          {t(confirm === 'push' ? 'syncPushConfirmBody' : 'syncPullConfirmBody')}
        </Modal>
      ) : null}
    </>
  )
}

/** 清除本机全部数据：对话、附件、API Key、设置与静态缓存，完成后回到首次访问状态 */
const ClearAllLocal = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      await clearLocalData()
      // 重新加载后内存状态也随之清空，App 会重新弹出首次访问的引导
      window.location.reload()
    } catch {
      setBusy(false)
      setConfirming(false)
      showToast({ key: 'resetLocalFailed', type: 'error' })
    }
  }

  return (
    <>
      <SettingCell
        label={t('resetLocal')}
        description={t('resetLocalDescription')}
        status={null}
        action={
          <Button
            variant="danger"
            size="m"
            className={styles.cellButton}
            disabled={disabled || busy}
            onClick={() => setConfirming(true)}
          >
            {t(busy ? 'resetLocalBusy' : 'resetLocalAction')}
          </Button>
        }
      />
      {confirming ? (
        <Modal
          title={t('resetLocalConfirmTitle')}
          className={styles.deleteConfirm}
          onClose={() => {
            if (!busy) {
              setConfirming(false)
            }
          }}
          footer={
            <div className={styles.deleteActions} aria-busy={busy}>
              <Button
                variant="outlined"
                autoFocus
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                {t('cancel')}
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => void run()}>
                {t(busy ? 'resetLocalBusy' : 'resetLocalConfirm')}
              </Button>
            </div>
          }
        >
          <div className={styles.resetConfirmText}>{t('resetLocalConfirmBody')}</div>
        </Modal>
      ) : null}
    </>
  )
}
