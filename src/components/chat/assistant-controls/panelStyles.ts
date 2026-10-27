export const panelClassName =
  "fixed w-[135px] max-h-[300px] overflow-y-auto px-1 snap-y snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

export const itemClassName =
  "snap-center flex items-center gap-2 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 rounded-[17.5px] whitespace-nowrap backdrop-blur-[10px]";

export const iconButtonClassName =
  "flex items-center justify-center gap-1 transition-all duration-200 h-[35px] min-h-[35px] w-[35px] text-[13px] rounded-[17.5px] backdrop-blur-[10px]";

export const panelButtonVariant = (isLightBackground: boolean) =>
  isLightBackground ? "dark" : "default";
