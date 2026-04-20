-- RPC to increment upvotes atomically
CREATE OR REPLACE FUNCTION increment_question_upvotes(question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE live_session_questions
    SET upvotes = upvotes + 1
    WHERE id = question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_question_upvotes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_question_upvotes(uuid) TO service_role;
