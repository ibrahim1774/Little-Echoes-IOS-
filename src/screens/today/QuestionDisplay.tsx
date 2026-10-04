import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Pulse } from '@/components/Pulse';
import { Screen } from '@/components/Screen';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/data/questions';
import type { Question } from '@/types';
import { GradientBackground } from './GradientBackground';

interface Props {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  childName: string;
  onStartRecording: () => void;
}

export function QuestionDisplay({
  question,
  questionIndex,
  totalQuestions,
  childName,
  onStartRecording,
}: Props) {
  const categoryColor = CATEGORY_COLORS[question.category];
  const categoryLabel = CATEGORY_LABELS[question.category];

  return (
    <Screen edges={['top']} className="items-center px-6 pt-8 pb-6">
      <GradientBackground />

      {/* Progress indicators */}
      <View className="flex-row gap-2 mb-6">
        {Array.from({ length: totalQuestions }).map((_, i) => (
          <View
            key={i}
            className={`h-2 rounded-full ${
              i < questionIndex ? 'w-6 opacity-100' : i === questionIndex ? 'w-10 opacity-100' : 'w-6 opacity-30'
            }`}
            style={{ backgroundColor: i <= questionIndex ? categoryColor : '#F0F0F0' }}
          />
        ))}
      </View>

      <Text className="font-inter text-echo-gray text-sm mb-6">
        Question {questionIndex + 1} of {totalQuestions}
      </Text>

      {/* Question text */}
      <View className="flex-1 items-center justify-center w-full gap-6">
        <Text
          testID="question-text"
          className="font-nunito-bold text-2xl text-echo-charcoal dark:text-white leading-relaxed text-center"
        >
          "{question.text}"
        </Text>

        {/* Category label */}
        <View className="flex-row items-center gap-2">
          <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColor }} />
          <Text className="font-nunito-semibold text-sm" style={{ color: categoryColor }}>
            {categoryLabel}
          </Text>
        </View>
      </View>

      {/* Record button */}
      <View className="items-center gap-4 mt-6">
        <Pulse>
          <Pressable
            onPress={onStartRecording}
            accessibilityRole="button"
            accessibilityLabel="Start recording"
            testID="question-start-recording"
            className="w-[120px] h-[120px] rounded-full bg-echo-coral items-center justify-center active:opacity-80"
            style={{
              shadowColor: '#FF6B6B',
              shadowOpacity: 0.4,
              shadowRadius: 32,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            <MicIcon />
          </Pressable>
        </Pulse>
        <Text className="font-nunito text-echo-gray text-sm text-center">
          Tap to record {childName}'s answer
        </Text>
      </View>
    </Screen>
  );
}

function MicIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="white">
      <Path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </Svg>
  );
}
