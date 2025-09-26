"use client";

import { useEffect, useRef } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

export function useAutoSubmit<T extends FieldValues>(
  form: UseFormReturn<T>,
  onSubmit: (data: T) => void | Promise<void>,
) {
  const onSubmitRef = useRef<typeof onSubmit>(onSubmit);
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    return form.subscribe({
      formState: { isValid: true, isValidating: true, values: true },
      callback: ({ values, isValid, isValidating }) => {
        if (isValid && !isValidating) {
          onSubmitRef.current(values);
        }
      },
    });
  }, [form]);
}
