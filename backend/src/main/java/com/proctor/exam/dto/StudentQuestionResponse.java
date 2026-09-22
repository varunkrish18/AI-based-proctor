package com.proctor.exam.dto;

// Sent to the student during the exam - never includes correctAnswer.
public record StudentQuestionResponse(
        Long questionId,
        String questionText,
        String optionA,
        String optionB,
        String optionC,
        String optionD
) {}
