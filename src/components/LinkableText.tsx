import React from "react";

interface LinkableTextProps {
  text: string;
  className?: string;
}

// Matches URLs with or without protocol (www.example.com, https://example.com)
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)/gi;

export const LinkableText: React.FC<LinkableTextProps> = ({ text, className }) => {
  const parts = text.split(URL_REGEX);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (URL_REGEX.test(part)) {
          // Reset lastIndex since we use global flag
          URL_REGEX.lastIndex = 0;
          const href = part.startsWith("http") ? part : `https://${part}`;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary hover:text-primary/80 break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        // Reset lastIndex for next test
        URL_REGEX.lastIndex = 0;
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </span>
  );
};
