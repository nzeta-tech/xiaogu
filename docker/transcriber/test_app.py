import unittest
from types import SimpleNamespace

from app import collect_transcript, finish_segment, normalize_segment_text, transcribe_options


class TranscriptFormattingTests(unittest.TestCase):
    def test_glossary_is_passed_in_safe_initial_prompt(self):
        options = transcribe_options("zh")
        self.assertEqual(options["language"], "zh")
        self.assertTrue(options["vad_filter"])
        self.assertIsNone(options["hotwords"])
        self.assertIn("重疾险", options["initial_prompt"])
        self.assertIn("专业术语", options["initial_prompt"])

    def test_short_pause_adds_comma_and_long_pause_adds_paragraph(self):
        segments = [
            SimpleNamespace(text="家庭应急资金怎么准备", start=0.0, end=1.0),
            SimpleNamespace(text="先保证安全性和灵活性", start=1.2, end=2.5),
            SimpleNamespace(text="再考虑收益", start=4.0, end=5.0),
        ]
        self.assertEqual(
            collect_transcript(segments),
            "家庭应急资金怎么准备，先保证安全性和灵活性。\n\n再考虑收益。",
        )

    def test_question_ending_uses_question_mark(self):
        self.assertEqual(finish_segment("有了百万医疗险还要买吗"), "有了百万医疗险还要买吗？")

    def test_conservative_insurance_corrections(self):
        self.assertEqual(
            normalize_segment_text("同意意外事故导致重大疾关移植"),
            "同一意外事故导致重大器官移植",
        )

    def test_medical_correction_requires_medical_context(self):
        self.assertEqual(normalize_segment_text("今天聊咖啡豆"), "今天聊咖啡豆")
        self.assertEqual(normalize_segment_text("今天聊咖啡疗法"), "今天聊CAR-T疗法")
        self.assertEqual(
            normalize_segment_text("癌细胞可以通过卡提疗法治疗"),
            "癌细胞可以通过CAR-T疗法治疗",
        )

    def test_ascii_punctuation_is_normalized_for_chinese_output(self):
        self.assertEqual(normalize_segment_text("保额,保费?都要看!"), "保额，保费？都要看！")

    def test_unicode_replacement_character_is_removed(self):
        self.assertEqual(normalize_segment_text("十个月内\ufffd是现金"), "十个月内是现金")

    def test_existing_terminal_punctuation_is_preserved(self):
        self.assertEqual(finish_segment("这是原句！", 2.0), "这是原句！\n\n")

    def test_ascii_term_spacing_is_not_destroyed(self):
        self.assertEqual(normalize_segment_text("这 是  CAR T  treatment"), "这是 CAR T treatment")


if __name__ == "__main__":
    unittest.main()
