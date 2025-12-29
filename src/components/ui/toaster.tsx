"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { Button } from "./button"
import { Copy } from "lucide-react"

export function Toaster() {
  const { toasts, toast: showToast } = useToast()

  const handleCopy = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    showToast({
      title: "Gekopieerd!",
      description: "De foutmelding is naar het klembord gekopieerd.",
      duration: 3000,
    });
  }

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, fullError, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
               {fullError && (
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="mt-2 w-fit"
                  onClick={() => handleCopy(fullError)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Kopieer Fout
                </Button>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
