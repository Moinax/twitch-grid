import { Fragment } from "react";
export function WordReveal({ text }: { text: string }) {
  return (
    <>
      {text
        .trim()
        .split(/\s+/)
        .map((word, index) => (
          <Fragment key={text + index}>
            {index > 0 && " "}
            <span style={{ transitionDelay: `${index * 40}ms` }}>{word}</span>
          </Fragment>
        ))}
    </>
  );
}
