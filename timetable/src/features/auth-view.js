// 로그인 화면 (서비스 모드). 이메일 매직 링크 + Google.

import { $ } from "../lib/dom.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_COOLDOWN = 30;

export function initAuthView({ repo }) {
  const view = $("authView");
  const form = $("authForm");
  const emailInput = $("authEmail");
  const emailBtn = $("authEmailBtn");
  const sent = $("authSent");
  const sentEmail = $("authSentEmail");
  const resendBtn = $("authResendBtn");
  const divider = $("authDivider");
  const googleBtn = $("authGoogleBtn");
  const errorEl = $("authError");
  let lastEmail = "";
  let cooldownTimer = null;

  const showError = (msg) => {
    errorEl.textContent = msg || "";
    errorEl.hidden = !msg;
  };

  function showForm() {
    form.hidden = false;
    divider.hidden = false;
    googleBtn.hidden = false;
    sent.hidden = true;
    clearInterval(cooldownTimer);
  }

  function startCooldown() {
    let left = RESEND_COOLDOWN;
    resendBtn.disabled = true;
    resendBtn.textContent = `다시 보내기 (${left}초)`;
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(cooldownTimer);
        resendBtn.disabled = false;
        resendBtn.textContent = "다시 보내기";
      } else resendBtn.textContent = `다시 보내기 (${left}초)`;
    }, 1000);
  }

  async function sendLink(email) {
    showError("");
    emailBtn.disabled = true;
    emailBtn.textContent = "보내는 중…";
    try {
      await repo.auth.signInWithEmail(email);
      lastEmail = email;
      sentEmail.textContent = email;
      form.hidden = true;
      divider.hidden = true;
      googleBtn.hidden = true;
      sent.hidden = false;
      startCooldown();
    } catch (err) {
      showError(err.message || "메일을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      emailBtn.disabled = false;
      emailBtn.textContent = "로그인 링크 받기";
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!EMAIL_RE.test(email)) {
      showError("이메일 주소를 확인해 주세요");
      emailInput.focus();
      return;
    }
    sendLink(email);
  });
  emailInput.addEventListener("input", () => showError(""));
  resendBtn.addEventListener("click", () => lastEmail && sendLink(lastEmail));
  $("authBackBtn").addEventListener("click", () => {
    showForm();
    emailInput.focus();
  });
  googleBtn.addEventListener("click", async () => {
    showError("");
    try {
      await repo.auth.signInWithGoogle();
    } catch (err) {
      showError(err.message || "Google 로그인을 시작하지 못했어요");
    }
  });

  return {
    show() {
      showForm();
      showError("");
      view.hidden = false;
    },
    hide() {
      view.hidden = true;
    },
  };
}
