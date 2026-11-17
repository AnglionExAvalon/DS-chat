import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import {
  closeOnboarding,
  goToApiKeySettings,
  openOnboarding,
  useOnboarding,
} from './onboardingState.js'
import apiKeysImage from '../../assets/onboarding-api-keys.png'
import createKeyImage from '../../assets/onboarding-create-key.png'
import styles from './Onboarding.module.css'

const API_KEYS_URL = 'https://platform.deepseek.com/api_keys'
const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

/**
 * 首次使用的引导：先问是否已有 API Key，没有则给出获取步骤。
 * 填入 Key 成功后由 App 触发「数据只存在本地」的说明。
 */
export const OnboardingDialog = () => {
  const t = useTranslate()
  const stage = useOnboarding((state) => state.stage)

  if (stage === 'ask') {
    return (
      <Modal
        title={t('onboardingAskTitle')}
        closable
        onClose={closeOnboarding}
        footer={
          <>
            <Button variant="outlined" size="m" onClick={() => openOnboarding('steps')}>
              {t('onboardingNoKey')}
            </Button>
            <Button size="m" onClick={goToApiKeySettings}>
              {t('onboardingHasKey')}
            </Button>
          </>
        }
      >
        <p className={styles.text}>{t('onboardingAskBody')}</p>
      </Modal>
    )
  }

  if (stage === 'steps') {
    return (
      <Modal
        title={t('onboardingStepsTitle')}
        closable
        className={styles.wide}
        mainClassName={styles.scrollable}
        onClose={closeOnboarding}
        footer={
          <>
            <Button variant="outlined" size="m" onClick={closeOnboarding}>
              {t('onboardingLater')}
            </Button>
            <Button size="m" onClick={goToApiKeySettings}>
              {t('onboardingGotKey')}
            </Button>
          </>
        }
      >
        <ol className={styles.steps}>
          <li>{t('onboardingStep1')}</li>
          <li>{t('onboardingStep2')}</li>
          <li>{t('onboardingStep3')}</li>
          <li>{t('onboardingStep4')}</li>
        </ol>
        <figure className={styles.figure}>
          <img src={apiKeysImage} alt={t('onboardingImageApiKeysAlt')} />
          <figcaption className={styles.caption}>{t('onboardingImageApiKeysCaption')}</figcaption>
        </figure>
        <figure className={styles.figure}>
          <img src={createKeyImage} alt={t('onboardingImageCreateAlt')} />
          <figcaption className={styles.caption}>{t('onboardingImageCreateCaption')}</figcaption>
        </figure>
        <p className={styles.links}>
          <a href={API_KEYS_URL} target="_blank" rel="noreferrer">
            {t('onboardingOpenApiKeys')}
          </a>
          <a href={TOP_UP_URL} target="_blank" rel="noreferrer">
            {t('onboardingTopUp')}
          </a>
        </p>
      </Modal>
    )
  }

  if (stage === 'storage') {
    return (
      <Modal
        title={t('onboardingStorageTitle')}
        closable
        onClose={closeOnboarding}
        footer={
          <Button size="m" onClick={closeOnboarding}>
            {t('onboardingStorageOk')}
          </Button>
        }
      >
        <p className={styles.text}>{t('onboardingStorageBody')}</p>
      </Modal>
    )
  }

  return null
}