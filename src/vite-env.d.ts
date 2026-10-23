/// <reference types="vite/client" />

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: { credential: string }) => void;
          auto_select?: boolean;
          cancel_on_tap_outside?: boolean;
          hosted_domain?: string;
        }) => void;
        renderButton: (
          parent: HTMLElement | null,
          options: {
            type?: "standard" | "icon";
            theme?: "outline" | "filled_blue" | "filled_black";
            size?: "large" | "medium" | "small";
            text?: "signin_with" | "signup_with" | "continue_with" | "signin";
            shape?: "rectangular" | "pill" | "circle" | "square";
            logo_alignment?: "left" | "center";
            width?: number | string;
            locale?: string;
          }
        ) => void;
        prompt: (notification?: (notification: unknown) => void) => void;
        disableAutoSelect: () => void;
      };
    };
  };
}
