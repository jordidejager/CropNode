-- Fix task_types: assign orphaned rows (user_id IS NULL) to admin user
-- and add missing common task types

-- 1. Fix orphaned task types
UPDATE task_types
SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617'
WHERE user_id IS NULL;

-- 2. Add commonly used fruit farming task types if they don't exist
INSERT INTO task_types (name, default_hourly_rate, user_id) VALUES
    ('Snoeien', 25.00, '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617'),
    ('Dunnen', 22.00, '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617'),
    ('Plukken', 20.00, '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617'),
    ('Sorteren', 18.00, '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617'),
    ('Onderhoud', 25.00, '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617'),
    ('Maaien', 22.00, '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617'),
    ('Spuiten', 25.00, '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617'),
    ('Boomverzorging', 24.00, '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617'),
    ('Fertigatie', 22.00, '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617'),
    ('Transport', 20.00, '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617')
ON CONFLICT (name) DO NOTHING;
