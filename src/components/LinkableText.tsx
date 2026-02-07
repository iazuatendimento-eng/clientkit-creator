import React from "react";

interface LinkableTextProps {
  text: string;
  className?: string;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export const LinkableText: React.FC<LinkableTextProps> = ({ text, className }) => {
  const parts = text.split(URL_REGEX);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary/80 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </span>
  );
};
