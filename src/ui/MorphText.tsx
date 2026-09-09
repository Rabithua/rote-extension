import { useLayoutEffect, useRef } from 'react';
import { MorphText as TextMotion } from '../motion/text';

export function MorphText({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motion = useRef<TextMotion | null>(null);
  useLayoutEffect(() => {
    const instance = new TextMotion(ref.current!); motion.current = instance;
    return () => { instance.destroy(); motion.current = null; };
  }, []);
  useLayoutEffect(() => { motion.current?.update(children); }, [children]);
  return <span ref={ref} />;
}
