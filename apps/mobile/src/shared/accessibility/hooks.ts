import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => subscription.remove();
  }, []);
  return reduced;
};

export const useReducedTransparency = (): boolean => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduced,
    );
    return () => subscription.remove();
  }, []);
  return reduced;
};
