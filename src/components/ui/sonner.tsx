import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * The app's alerts as pills, in the look of the app (PS slate): a dark see-through pill with a soft blur, a faint rim
 * and a deep shadow, white text, the icon coloured by its kind (turquoise done, red error, amber warning), the action
 * a small white pill; at the top centre, under the header, like the "Salvato" pill. Same in light and dark theme.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group app-toaster"
      position="top-center"
      customAriaLabel="Notifiche (Alt+T)"
      // Every alert goes away with a swipe sideways (left or right) or up, not only up as by default at the top centre.
      swipeDirections={["left", "right", "top"]}
      offset="calc(env(safe-area-inset-top) + 0.75rem)"
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 0.75rem)", left: "1rem", right: "1rem" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast app-toast group-[.toaster]:!rounded-[28px] group-[.toaster]:!border group-[.toaster]:!border-white/10 group-[.toaster]:!bg-[oklch(0.25_0.016_258/0.94)] group-[.toaster]:!text-white group-[.toaster]:!shadow-[0_14px_36px_-10px_rgb(0_0_0/0.65),inset_0_1px_0_rgb(255_255_255/0.08)] group-[.toaster]:backdrop-blur-md group-[.toaster]:!px-4 group-[.toaster]:!py-3 group-[.toaster]:!gap-2.5",
          title: "!text-[14px] !font-semibold !leading-snug",
          description: "!text-[12.5px] !leading-snug !text-white/70",
          actionButton: "!h-8 !rounded-full !bg-white !px-3 !text-[13px] !font-semibold !text-black",
          cancelButton: "!h-8 !rounded-full !bg-white/10 !px-3 !text-[13px] !font-semibold !text-white",
          closeButton: "!border-white/10 !bg-[oklch(0.25_0.016_258)] !text-white",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
