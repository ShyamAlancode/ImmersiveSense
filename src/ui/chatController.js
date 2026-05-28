import renderMathInElement from "../../node_modules/katex/dist/contrib/auto-render.mjs";
import { tutorState } from "../state/tutorState.js";

const chatHistory = [];
// This will be populated dynamically from the app state
let currentSceneContext = null;

export function updateChatContext(context) {
  currentSceneContext = context;
}

export function initFloatingChat() {
  // Re-query elements here so the function always works even if the module
  // was imported before DOMContentLoaded, and bail gracefully if any are missing.
  const toggleBtn     = document.getElementById("floatingChatToggle");
  const chatContainer = document.getElementById("floatingChatbot");
  const closeBtn      = document.getElementById("floatingChatClose");
  const historyEl     = document.getElementById("floatingChatHistory");
  const formEl        = document.getElementById("floatingChatForm");
  const inputEl       = document.getElementById("floatingChatInput");

  if (!toggleBtn || !chatContainer || !closeBtn || !historyEl || !formEl || !inputEl) {
    console.warn("initFloatingChat: one or more required DOM elements not found — chat will not initialise.");
    return;
  }

  const updateFullContext = (plan) => {
    if (!plan) {
      updateChatContext(null);
      return;
    }
    const currentStep = tutorState.getCurrentStep();
    updateChatContext({
      problem: plan.problem || {},
      derivedValues: plan.derivedValues || {},
      explanation: plan.explanation || "",
      finalAnswer: plan.answerScaffold?.finalAnswer || "",
      steps: plan.analyticContext?.solutionSteps || plan.steps || [],
      learningStage: tutorState.learningStage,
      currentStep: currentStep ? {
        title: currentStep.title || "",
        instruction: currentStep.instruction || currentStep.goal || "",
        hint: currentStep.hint || currentStep.prompt || ""
      } : null,
      latestAssessment: tutorState.latestAssessment || null,
      learnerHistory: tutorState.learnerHistory || []
    });
  };

  tutorState.on("plan", ({ plan }) => updateFullContext(plan));
  tutorState.on("step", () => updateFullContext(tutorState.plan));
  tutorState.on("learning-stage", () => updateFullContext(tutorState.plan));
  tutorState.on("assessment", () => updateFullContext(tutorState.plan));
  tutorState.on("verdict", () => updateFullContext(tutorState.plan));

  if (tutorState.plan) {
    updateFullContext(tutorState.plan);
  }

  toggleBtn.addEventListener("click", () => {
    chatContainer.classList.remove("hidden");
    toggleBtn.classList.add("hidden");
    inputEl.focus();
  });

  closeBtn.addEventListener("click", () => {
    chatContainer.classList.add("hidden");
    toggleBtn.classList.remove("hidden");
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formEl.dispatchEvent(new Event("submit"));
    }
  });

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;

    // 1. Add User Message
    appendMessage("user", text, historyEl);
    chatHistory.push({ role: "user", content: text });
    inputEl.value = "";

    // 2. Add empty Assistant Message
    const msgEl = appendMessage("assistant", "", historyEl);
    const p = msgEl.querySelector("p");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          context: currentSceneContext
        })
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || "Failed to connect to Chatbot.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        
        // Basic rendering: replace newlines with <br>
        p.innerHTML = fullText.replace(/\n/g, "<br/>");
        historyEl.scrollTop = historyEl.scrollHeight;
      }

      chatHistory.push({ role: "assistant", content: fullText });

      // Process Math explicitly using KaTeX auto-render if available
      try {
        renderMathInElement(msgEl, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true }
          ]
        });
      } catch (mathErr) {
        console.warn("KaTeX render failed for chat:", mathErr);
      }

    } catch (err) {
      console.error(err);
      p.innerHTML = `<i>${err.message || "Sorry, the connection failed. Please try again."}</i>`;
    }
  });
}

function appendMessage(role, text, historyEl) {
  const div = document.createElement("div");
  div.className = `chat-message ${role}`;
  const p = document.createElement("p");
  p.textContent = text;
  div.appendChild(p);
  historyEl.appendChild(div);
  historyEl.scrollTop = historyEl.scrollHeight;
  return div;
}
