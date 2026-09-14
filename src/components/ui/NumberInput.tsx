import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  value: number;
};

const toText = (value: number) => (value === 0 || !Number.isFinite(value) ? '' : String(value));

/**
 * A number field for numeric state that starts blank instead of showing 0.
 *
 * A plain `<input type="number" value={0}>` has two problems: the form opens
 * with a 0 the user has to delete, and typing after it leaves "015" on screen,
 * because React sees 15 === Number("015") and never rewrites the text.
 *
 * This keeps the typed text locally, so the field can be blank while the state
 * holds 0, and a deliberately typed "0" still stays visible. `onChange`
 * receives the native event, so existing `Number(e.target.value)` handlers
 * work unchanged (an empty field reads as 0).
 */
export default function NumberInput({ value, onChange, ...props }: Props) {
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  // The value changed from outside (a form reset, an edit modal loading a
  // record): show it, unless it is what the current text already means.
  if (value !== lastValue) {
    setLastValue(value);
    if (Number(text) !== value) setText(toText(value));
  }

  return (
    <input
      {...props}
      type="number"
      value={text}
      onChange={(event) => {
        // "015" -> "15", while "0" and "0.5" are left as typed.
        setText(event.target.value.replace(/^(-?)0+(?=\d)/, '$1'));
        onChange?.(event);
      }}
    />
  );
}
