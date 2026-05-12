interface StatusBannerProps {
    text: string;
}

export const StatusBanner = ({ text }: StatusBannerProps) => (
    <p id="status" className="status" aria-live="polite">
        {text}
    </p>
);
