import { action, createOptimistic, createUniqueId, useContext } from 'solid-js';
import type { OwnProfile } from '../auth/ownProfile';
import { t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { ToastContext } from '../ui/toastContext';
import { PopupModal } from '../popups/PopupModal';
import { ariaTrue } from '../ui/dom';
import { Button } from '../ui';
import { createPasswordChange } from './PasswordForm';
import { dismissPasswordSuggestion } from './settings';
import './profile.css';

const text = t.password;

/**
 * Proposal to set an own password after the first sign-in with a generated one. „Pomiń” saves
 * that the player declined it; the change itself is the same form as in the settings.
 */
export function PasswordPopup(props: { readonly me: OwnProfile }) {
  const auth = useContext(AuthContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const formId = createUniqueId();
  const form = createPasswordChange(
    () => props.me,
    () => {
      toast.show(text.toasts.changed, 'success');
      popups.back();
    },
  );

  const [skipping, setSkipping] = createOptimistic(false);
  const skip = action(function* () {
    setSkipping(true);
    try {
      yield dismissPasswordSuggestion(auth.client, props.me.id);
    } catch {
      form.setError(text.errors.skip);
      return;
    }
    form.clearSuggestion();
    popups.back();
  });

  return (
    <PopupModal
      title={text.firstTitle}
      footer={
        <>
          <Button
            variant="secondary"
            loading={skipping()}
            disabled={form.changing()}
            onClick={() => void skip()}
          >
            {text.skip}
          </Button>
          <Button type="submit" form={formId} loading={form.changing()} disabled={skipping()}>
            {text.submit}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        class="password-form"
        novalidate
        onSubmit={form.submit}
        aria-busy={ariaTrue(form.changing() || skipping())}
      >
        <p class="password-form__intro">{text.firstIntro}</p>
        <form.Fields currentLabel={text.firstCurrentLabel} />
      </form>
    </PopupModal>
  );
}
