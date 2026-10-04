import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  value: number;
};

const toText = (value: number) => (value === 0 || !Number.isFinite(value) ? '' : String(value));

export default function NumberInput({ value, onChange, ...props }: Props) {
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

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
        setText(event.target.value.replace(/^(-?)0+(?=\d)/, '$1'));
        onChange?.(event);
      }}
    />
  );
}
