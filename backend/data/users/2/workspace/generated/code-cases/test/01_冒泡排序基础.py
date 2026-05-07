"""
冒泡排序 - Case 01: 基础冒泡排序

目标: 用最直观的方式实现冒泡排序，理解"相邻比较、逐轮冒泡"的核心思想
先修: Python 基础语法、for 循环、列表操作
难度: ⭐
预计用时: 10 分钟
"""

# === 1. 导入 ===
import numpy as np

# === 2. 核心实现 ===

def bubble_sort(arr):
    """
    冒泡排序 —— 最朴素的版本

    算法思路（一句话）：
        每轮从头到尾扫描相邻元素，如果前面 > 后面就交换，
        一轮下来最大的元素就"冒泡"到了末尾。

    时间复杂度: O(n²)  最坏 & 平均
    空间复杂度: O(1)    原地排序（这里为了不改原数组用了 copy）
    """
    n = len(arr)
    result = arr.copy()  # 避免修改原始数据

    # 外层循环：共需要 n-1 轮（每轮确定一个最大值的位置）
    for i in range(n - 1):
        # 内层循环：每轮比较相邻元素，范围逐步缩小
        # 因为每轮结束后，末尾已排好的部分不需要再比较
        for j in range(n - 1 - i):
            if result[j] > result[j + 1]:
                # 交换相邻元素 —— 这就是"冒泡"的过程
                result[j], result[j + 1] = result[j + 1], result[j]

    return result


# === 3. 验证 ===

def main():
    np.random.seed(42)

    # --- 基本测试 ---
    data = np.array([64, 34, 25, 12, 22, 11, 90])
    print("=" * 40)
    print("冒泡排序 - 基础版")
    print("=" * 40)
    print(f"排序前: {data}")
    sorted_data = bubble_sort(data)
    print(f"排序后: {sorted_data}")

    # --- 随机数组测试 ---
    random_data = np.random.randint(0, 100, size=15)
    print(f"\n随机数组: {random_data}")
    sorted_random = bubble_sort(random_data)
    print(f"排序后:  {sorted_random}")

    # --- 验证正确性（与 numpy 内置排序对比）---
    assert np.array_equal(sorted_random, np.sort(random_data)), "排序结果与 numpy 不一致!"
    print("\n✅ 排序正确性验证通过！")


if __name__ == "__main__":
    main()
