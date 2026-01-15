"""
Unit tests for Social Reward Functions (BAB-71)

Tests the social reward calculation functions that enable
non-trading archetypes like "Social Butterfly" to achieve
high scores without trading.
"""

import pytest
from src.training.rewards import (
    BehaviorMetrics,
    SocialRewardResult,
    NarrativeEvent,
    calculate_engagement_score,
    calculate_information_spread_score,
    calculate_network_score,
    calculate_narrative_alignment_score,
    calculate_social_reward,
    social_only_composite_reward,
    TrajectoryRewardInputs,
)


class TestEngagementScore:
    """Tests for calculate_engagement_score()"""

    def test_high_engagement_score(self):
        """Agent with lots of social activity should score high"""
        metrics = BehaviorMetrics(
            posts_created=10,
            comments_made=8,
            dms_initiated=5,
            group_chats_joined=4,
            mentions_given=3,
        )
        score = calculate_engagement_score(metrics)
        assert score >= 0.8, f"High activity should score >= 0.8, got {score}"

    def test_moderate_engagement_score(self):
        """Agent with moderate activity should score moderately"""
        metrics = BehaviorMetrics(
            posts_created=2,
            comments_made=2,
            dms_initiated=1,
            group_chats_joined=1,
            mentions_given=0,
        )
        score = calculate_engagement_score(metrics)
        assert 0.4 <= score <= 0.8, f"Moderate activity should score 0.4-0.8, got {score}"

    def test_zero_engagement_score(self):
        """Agent with no social activity should score low"""
        metrics = BehaviorMetrics()
        score = calculate_engagement_score(metrics)
        assert score <= 0.2, f"No activity should score <= 0.2, got {score}"

    def test_diversity_bonus(self):
        """Diverse activity types should score higher than single type"""
        # Single type: all posts
        single_type = BehaviorMetrics(posts_created=10)
        
        # Diverse: spread across types
        diverse = BehaviorMetrics(
            posts_created=2,
            comments_made=2,
            dms_initiated=2,
            group_chats_joined=2,
            mentions_given=2,
        )
        
        single_score = calculate_engagement_score(single_type)
        diverse_score = calculate_engagement_score(diverse)
        
        assert diverse_score > single_score, \
            f"Diverse activity ({diverse_score}) should beat single type ({single_score})"


class TestInformationSpreadScore:
    """Tests for calculate_information_spread_score()"""

    def test_high_spread_score(self):
        """Content that spreads widely should score high"""
        metrics = BehaviorMetrics(
            information_spread=20,
            positive_reactions=10,
            followers_gained=5,
        )
        score = calculate_information_spread_score(metrics)
        assert score >= 0.9, f"High spread should score >= 0.9, got {score}"

    def test_moderate_spread_score(self):
        """Content that spreads moderately should score moderately"""
        metrics = BehaviorMetrics(
            information_spread=6,
            positive_reactions=3,
            followers_gained=1,
        )
        score = calculate_information_spread_score(metrics)
        assert 0.5 <= score <= 0.9, f"Moderate spread should score 0.5-0.9, got {score}"

    def test_zero_spread_score(self):
        """Content that doesn't spread should score low"""
        metrics = BehaviorMetrics(
            information_spread=0,
            positive_reactions=0,
            followers_gained=0,
        )
        score = calculate_information_spread_score(metrics)
        assert score <= 0.2, f"No spread should score <= 0.2, got {score}"

    def test_reactions_boost_score(self):
        """Reactions should boost score even without direct spread"""
        no_reactions = BehaviorMetrics(information_spread=5)
        with_reactions = BehaviorMetrics(
            information_spread=5,
            positive_reactions=10,
        )
        
        assert calculate_information_spread_score(with_reactions) > \
               calculate_information_spread_score(no_reactions)


class TestNetworkScore:
    """Tests for calculate_network_score()"""

    def test_large_network_score(self):
        """Agent with many connections should score high"""
        metrics = BehaviorMetrics(
            unique_users_interacted=20,
            group_chats_joined=5,
            reputation_delta=30,
        )
        score = calculate_network_score(metrics)
        assert score >= 0.9, f"Large network should score >= 0.9, got {score}"

    def test_moderate_network_score(self):
        """Agent with moderate connections should score moderately"""
        metrics = BehaviorMetrics(
            unique_users_interacted=8,
            group_chats_joined=2,
            reputation_delta=5,
        )
        score = calculate_network_score(metrics)
        assert 0.5 <= score <= 0.9, f"Moderate network should score 0.5-0.9, got {score}"

    def test_isolated_score(self):
        """Agent with few connections should score low"""
        metrics = BehaviorMetrics(
            unique_users_interacted=1,
            group_chats_joined=0,
            reputation_delta=0,
        )
        score = calculate_network_score(metrics)
        assert score <= 0.3, f"Isolated agent should score <= 0.3, got {score}"

    def test_negative_reputation_penalty(self):
        """Negative reputation should penalize score"""
        good_rep = BehaviorMetrics(
            unique_users_interacted=10,
            reputation_delta=20,
        )
        bad_rep = BehaviorMetrics(
            unique_users_interacted=10,
            reputation_delta=-20,
        )
        
        assert calculate_network_score(good_rep) > calculate_network_score(bad_rep)


class TestNarrativeAlignmentScore:
    """Tests for calculate_narrative_alignment_score()"""

    def test_prediction_accuracy_proxy(self):
        """Without timeline, prediction accuracy should be used"""
        metrics = BehaviorMetrics(
            predictions_made=10,
            correct_predictions=8,
            prediction_accuracy=0.8,
        )
        score = calculate_narrative_alignment_score(metrics)
        assert score == 0.8, f"Should use prediction_accuracy, got {score}"

    def test_no_predictions_neutral(self):
        """No predictions should return neutral score"""
        metrics = BehaviorMetrics(predictions_made=0)
        score = calculate_narrative_alignment_score(metrics)
        assert score == 0.5, f"No predictions should return 0.5, got {score}"

    def test_timeline_alignment(self):
        """Agent that reacts correctly to events should score high"""
        metrics = BehaviorMetrics()
        
        events = [
            NarrativeEvent(
                tick=10,
                event_type="earnings",
                affected_tickers=["AAPL"],
                direction="up",
                revealed=True,
            ),
        ]
        
        actions = [
            {"tick": 12, "action_type": "buy", "ticker": "AAPL"},
        ]
        
        score = calculate_narrative_alignment_score(metrics, actions, events)
        assert score == 1.0, f"Correct reaction should score 1.0, got {score}"

    def test_timeline_misalignment(self):
        """Agent that reacts incorrectly to events should score low"""
        metrics = BehaviorMetrics()
        
        events = [
            NarrativeEvent(
                tick=10,
                event_type="scandal",
                affected_tickers=["AAPL"],
                direction="down",
                revealed=True,
            ),
        ]
        
        actions = [
            {"tick": 12, "action_type": "buy", "ticker": "AAPL"},  # Wrong: should sell
        ]
        
        score = calculate_narrative_alignment_score(metrics, actions, events)
        assert score == 0.0, f"Wrong reaction should score 0.0, got {score}"


class TestCalculateSocialReward:
    """Tests for calculate_social_reward()"""

    def test_social_butterfly_weights(self):
        """Social Butterfly should weight network highly"""
        metrics = BehaviorMetrics(
            unique_users_interacted=20,
            group_chats_joined=5,
            posts_created=10,
            information_spread=5,
            reputation_delta=20,
        )
        
        result = calculate_social_reward(metrics, "social-butterfly")
        
        assert isinstance(result, SocialRewardResult)
        assert result.network_score > 0.8
        assert result.total_score > 0.6

    def test_information_trader_weights(self):
        """Information Trader should weight narrative alignment highly"""
        metrics = BehaviorMetrics(
            predictions_made=10,
            correct_predictions=8,
            prediction_accuracy=0.8,
            unique_users_interacted=5,
            group_chats_joined=3,
        )
        
        result = calculate_social_reward(metrics, "information-trader")
        
        assert result.narrative_alignment_score == 0.8
        # Info trader weights narrative at 40%
        assert result.total_score > 0.4

    def test_scammer_weights(self):
        """Scammer should weight spread highly"""
        metrics = BehaviorMetrics(
            information_spread=15,
            positive_reactions=10,
            unique_users_interacted=10,
        )
        
        result = calculate_social_reward(metrics, "scammer")
        
        assert result.information_spread_score > 0.8
        # Scammer weights spread at 40%
        assert result.total_score > 0.5

    def test_default_archetype_balanced(self):
        """Unknown archetype should use balanced weights"""
        metrics = BehaviorMetrics(
            unique_users_interacted=10,
            posts_created=5,
            information_spread=5,
            predictions_made=5,
            correct_predictions=3,
            prediction_accuracy=0.6,
        )
        
        result = calculate_social_reward(metrics, "unknown-archetype")
        
        # All components should contribute equally (25% each)
        assert 0.3 <= result.total_score <= 0.7


class TestSocialOnlyCompositeReward:
    """Tests for social_only_composite_reward()"""

    def test_social_butterfly_pnl_irrelevant(self):
        """Social Butterfly should score high even with zero PnL"""
        inputs = TrajectoryRewardInputs(
            final_pnl=0,
            starting_balance=10000,
            end_balance=10000,
            format_score=0.8,
            reasoning_score=0.7,
        )
        
        metrics = BehaviorMetrics(
            unique_users_interacted=20,
            group_chats_joined=5,
            posts_created=10,
            dms_initiated=8,
            reputation_delta=30,
        )
        
        reward = social_only_composite_reward(
            inputs=inputs,
            archetype="social-butterfly",
            behavior_metrics=metrics,
        )
        
        assert reward > 0.5, f"Social Butterfly with great social metrics should score > 0.5 even with $0 PnL, got {reward}"

    def test_bankruptcy_still_penalized(self):
        """Even social butterflies shouldn't go bankrupt"""
        inputs = TrajectoryRewardInputs(
            final_pnl=-10000,
            starting_balance=10000,
            end_balance=0,
            format_score=0.8,
            reasoning_score=0.7,
        )
        
        metrics = BehaviorMetrics(
            unique_users_interacted=20,
            group_chats_joined=5,
        )
        
        reward = social_only_composite_reward(
            inputs=inputs,
            archetype="social-butterfly",
            behavior_metrics=metrics,
        )
        
        assert reward == -0.5, f"Bankruptcy should return -0.5, got {reward}"

    def test_social_butterfly_beats_poor_trader(self):
        """Social Butterfly with great social should beat trader with poor trading"""
        # Great social, no trading
        social_inputs = TrajectoryRewardInputs(
            final_pnl=0,
            starting_balance=10000,
            end_balance=10000,
            format_score=0.8,
            reasoning_score=0.7,
        )
        social_metrics = BehaviorMetrics(
            unique_users_interacted=20,
            group_chats_joined=5,
            posts_created=15,
            dms_initiated=10,
            reputation_delta=40,
        )
        
        # Bad trading, no social
        trader_inputs = TrajectoryRewardInputs(
            final_pnl=-500,
            starting_balance=10000,
            end_balance=9500,
            format_score=0.6,
            reasoning_score=0.5,
        )
        trader_metrics = BehaviorMetrics(
            trades_executed=10,
            profitable_trades=3,
            win_rate=0.3,
            total_pnl=-500,
        )
        
        social_reward = social_only_composite_reward(
            inputs=social_inputs,
            archetype="social-butterfly",
            behavior_metrics=social_metrics,
        )
        
        # For fair comparison, evaluate trader using same social scoring
        trader_reward = social_only_composite_reward(
            inputs=trader_inputs,
            archetype="social-butterfly",
            behavior_metrics=trader_metrics,
        )
        
        assert social_reward > trader_reward, \
            f"Social butterfly ({social_reward}) should beat poor trader ({trader_reward})"


class TestIntegrationNonTraderCanWin:
    """
    Integration test: Non-trader archetype can outscore passive trader
    
    This proves that the reward function allows social-focused agents
    to achieve high scores without trading profitably.
    """

    def test_social_butterfly_outscores_passive_trader(self):
        """
        A Social Butterfly with high social engagement should outscore
        a passive trader who just holds their balance.
        """
        # Passive trader: held balance, did nothing
        passive_inputs = TrajectoryRewardInputs(
            final_pnl=0,
            starting_balance=10000,
            end_balance=10000,
            format_score=0.5,  # Average format
            reasoning_score=0.5,  # Average reasoning
        )
        passive_metrics = BehaviorMetrics(
            trades_executed=0,
            unique_users_interacted=0,
        )
        
        # Active Social Butterfly: lots of engagement, no trading
        butterfly_inputs = TrajectoryRewardInputs(
            final_pnl=0,
            starting_balance=10000,
            end_balance=10000,
            format_score=0.8,
            reasoning_score=0.7,
        )
        butterfly_metrics = BehaviorMetrics(
            trades_executed=0,
            unique_users_interacted=25,
            group_chats_joined=6,
            dms_initiated=15,
            posts_created=20,
            comments_made=30,
            mentions_given=10,
            followers_gained=15,
            reputation_delta=50,
            positive_reactions=25,
            information_spread=12,
        )
        
        passive_reward = social_only_composite_reward(
            inputs=passive_inputs,
            archetype="social-butterfly",
            behavior_metrics=passive_metrics,
        )
        
        butterfly_reward = social_only_composite_reward(
            inputs=butterfly_inputs,
            archetype="social-butterfly",
            behavior_metrics=butterfly_metrics,
        )
        
        assert butterfly_reward > passive_reward, \
            f"Active butterfly ({butterfly_reward:.3f}) should outscore passive ({passive_reward:.3f})"
        
        # The difference should be significant
        assert butterfly_reward - passive_reward > 0.2, \
            f"Score difference ({butterfly_reward - passive_reward:.3f}) should be > 0.2"

    def test_information_trader_with_predictions_outscores_random_trader(self):
        """
        Information Trader with good predictions but no trading
        should outscore trader with random trades.
        """
        # Random trader: traded randomly, lost money
        random_inputs = TrajectoryRewardInputs(
            final_pnl=-200,
            starting_balance=10000,
            end_balance=9800,
            format_score=0.5,
            reasoning_score=0.4,
        )
        random_metrics = BehaviorMetrics(
            trades_executed=10,
            profitable_trades=4,
            win_rate=0.4,
            total_pnl=-200,
        )
        
        # Information trader: gathered intel, made predictions
        intel_inputs = TrajectoryRewardInputs(
            final_pnl=0,
            starting_balance=10000,
            end_balance=10000,
            format_score=0.9,
            reasoning_score=0.85,
        )
        intel_metrics = BehaviorMetrics(
            trades_executed=0,
            predictions_made=15,
            correct_predictions=12,
            prediction_accuracy=0.8,
            unique_users_interacted=10,
            group_chats_joined=4,
            dms_initiated=8,
            info_requests_sent=10,
        )
        
        random_reward = social_only_composite_reward(
            inputs=random_inputs,
            archetype="information-trader",
            behavior_metrics=random_metrics,
        )
        
        intel_reward = social_only_composite_reward(
            inputs=intel_inputs,
            archetype="information-trader",
            behavior_metrics=intel_metrics,
        )
        
        assert intel_reward > random_reward, \
            f"Intel trader ({intel_reward:.3f}) should outscore random ({random_reward:.3f})"

