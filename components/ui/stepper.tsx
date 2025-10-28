"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  title: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      <ol role="list" className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          return (
            <li key={step.id} className={cn("flex-1", index !== steps.length - 1 && "pr-8 sm:pr-20")}>
              <div className="flex items-center">
                <div className="relative flex flex-col items-center">
                  {/* Circle with number or check */}
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                      isCompleted && "border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500",
                      isCurrent && "border-sky-600 bg-white text-sky-600 dark:border-sky-500 dark:bg-slate-900 dark:text-sky-400",
                      isUpcoming && "border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                    )}
                  >
                    {isCompleted ? <Check className="h-5 w-5" /> : stepNumber}
                  </div>

                  {/* Step title */}
                  <div className="mt-2 text-center">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        (isCompleted || isCurrent) && "text-slate-900 dark:text-slate-100",
                        isUpcoming && "text-slate-500 dark:text-slate-400"
                      )}
                    >
                      {step.title}
                    </p>
                    {step.description && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[120px]">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Connector line */}
                {index !== steps.length - 1 && (
                  <div
                    className={cn(
                      "absolute left-[50%] top-5 h-0.5 w-full transition-colors",
                      isCompleted ? "bg-sky-600 dark:bg-sky-500" : "bg-slate-300 dark:bg-slate-700"
                    )}
                    style={{ marginLeft: "20px" }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
