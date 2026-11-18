import { type ReactElement, useState } from "react";

export interface ConfirmButtonProps {
  readonly label: string;
  readonly confirmation: string;
  readonly isDisabled?: boolean;
  readonly onConfirm: () => Promise<string | null>;
  readonly onDone: () => void;
}

type ConfirmStep = "idle" | "confirming" | "busy";

export function ConfirmButton({
  label,
  confirmation,
  isDisabled = false,
  onConfirm,
  onDone,
}: ConfirmButtonProps): ReactElement {
  const [step, setStep] = useState<ConfirmStep>("idle");
  const [failure, setFailure] = useState<string | null>(null);

  const confirm = (): void => {
    setStep("busy");
    onConfirm()
      .then((refusal) => {
        if (refusal === null) {
          onDone();
          return;
        }
        setFailure(refusal);
        setStep("idle");
      })
      .catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : "unknown");
        setStep("idle");
      });
  };

  if (step === "idle") {
    return (
      <div className="confirm">
        <button
          type="button"
          className="btn pri"
          disabled={isDisabled}
          onClick={() => {
            setFailure(null);
            setStep("confirming");
          }}
        >
          {label}
        </button>
        {failure !== null && <div className="pop-failure">{failure}</div>}
      </div>
    );
  }
  return (
    <div className="confirm confirming">
      <div className="q">{confirmation}</div>
      <div className="row">
        <button type="button" className="btn pri" disabled={step === "busy"} onClick={confirm}>
          {step === "busy" ? "Working…" : `Confirm: ${label}`}
        </button>
        <button
          type="button"
          className="btn"
          disabled={step === "busy"}
          onClick={() => {
            setStep("idle");
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
