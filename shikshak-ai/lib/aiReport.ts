import { generateAILesson } from "./ai";

export async function generateAIReport(data: string){
 return generateAILesson(`
 You are a school data analyst.

 DO NOT create lesson plan.
 DO NOT create objectives.
 DO NOT create teaching content.

 Only give:
 - Class performance summary
 - Weak students
 - Strong students
 - Suggestions

 Class Data:
 ${data}
 `);
}
