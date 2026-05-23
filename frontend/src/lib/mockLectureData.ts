// Mock data for testing immersive classroom without backend
// Each block has a 'speech' field in metadata for TTS narration

interface ContentBlock {
  id: string;
  type: 'title' | 'insight' | 'formula' | 'list' | 'code' | 'text';
  content: string | string[];
  metadata?: Record<string, any>;
}

export const mockLectureBlocks: ContentBlock[] = [
  {
    id: 'block-1',
    type: 'title',
    content: '深度学习与神经网络',
    metadata: {
      level: 1,
      speech: '欢迎来到深度学习课程。今天我们将一起探索深度学习和神经网络的奥秘。这是一个激动人心的领域，它正在改变我们的世界。让我们开始这段学习之旅吧。'
    }
  },
  {
    id: 'block-2',
    type: 'title',
    content: '什么是深度学习',
    metadata: {
      level: 2,
      section: 1,
      speech: '首先，让我们来理解什么是深度学习。深度学习是人工智能领域的一个重要分支，它的核心思想是模仿人脑的工作方式。'
    }
  },
  {
    id: 'block-3',
    type: 'insight',
    content: '深度学习是机器学习的一个分支，它使用多层神经网络来学习数据的层次化表示。',
    metadata: {
      section: 1,
      speech: '这里有一个关键洞察。深度学习本质上是机器学习的一个特殊分支。它的特别之处在于使用了多层神经网络。这些网络层层叠加，就像人脑中的神经元一样，能够学习数据中越来越抽象的特征。从简单的边缘检测，到复杂的物体识别，都是通过这种层次化的学习实现的。'
    }
  },
  {
    id: 'block-4',
    type: 'text',
    content: '深度学习的核心思想是通过多层非线性变换，从原始数据中自动学习有用的特征表示。',
    metadata: {
      section: 1,
      speech: '让我详细解释一下深度学习的核心思想。传统的机器学习方法需要人工设计特征，这是一个非常耗时且需要专业知识的过程。但深度学习不同，它能够自动从原始数据中学习特征。通过多层非线性变换，网络可以逐步提取越来越高级的特征表示。这就是深度学习如此强大的原因。'
    }
  },
  {
    id: 'block-5',
    type: 'list',
    content: [
      '自动特征提取：无需手动设计特征',
      '端到端学习：从输入到输出的直接映射',
      '层次化表示：逐层抽象的特征学习'
    ],
    metadata: {
      section: 1,
      speech: '深度学习有三个核心优势。第一，自动特征提取，这意味着我们不再需要花费大量时间手动设计特征。第二，端到端学习，网络可以直接从原始输入学习到最终输出的映射关系。第三，层次化表示，网络的每一层都在学习不同抽象级别的特征，从低级到高级，逐步构建对数据的理解。'
    }
  },
  {
    id: 'block-6',
    type: 'title',
    content: '神经网络的基本结构',
    metadata: {
      level: 2,
      section: 2,
      speech: '现在让我们深入了解神经网络的基本结构。理解这个结构对于掌握深度学习至关重要。'
    }
  },
  {
    id: 'block-7',
    type: 'text',
    content: '神经网络由输入层、隐藏层和输出层组成。每一层包含多个神经元，神经元之间通过权重连接。',
    metadata: {
      section: 2,
      speech: '一个典型的神经网络包含三种类型的层。输入层接收原始数据，比如图像的像素值。隐藏层是网络的核心，可以有一层或多层，负责特征提取和变换。输出层产生最终的预测结果。每一层都由多个神经元组成，这些神经元通过权重相互连接。权重的值决定了信息如何在网络中流动。'
    }
  },
  {
    id: 'block-8',
    type: 'formula',
    content: 'y = \\sigma(Wx + b)',
    metadata: {
      section: 2,
      speech: '这是神经网络中最基本的数学公式。让我来解释一下。y 是输出，x 是输入。W 是权重矩阵，它决定了输入如何被转换。b 是偏置项，用于调整输出的基准值。sigma 是激活函数，它引入非线性。这个简单的公式是整个深度学习的基础。'
    }
  },
  {
    id: 'block-9',
    type: 'text',
    content: '其中 W 是权重矩阵，b 是偏置向量，σ 是激活函数。',
    metadata: {
      section: 2,
      speech: '让我们更详细地看看这个公式的每个部分。权重矩阵 W 包含了网络学习到的所有参数，它的大小取决于输入和输出的维度。偏置向量 b 为每个神经元提供了一个可调节的阈值。激活函数 sigma 是关键，它让网络能够学习非线性关系，这是神经网络强大能力的来源。'
    }
  },
  {
    id: 'block-10',
    type: 'insight',
    content: '激活函数引入非线性，使神经网络能够学习复杂的函数映射。',
    metadata: {
      section: 2,
      speech: '这里有一个非常重要的概念。如果没有激活函数，无论网络有多少层，它都只能学习线性关系。但现实世界的问题大多是非线性的。激活函数的引入，让每一层都能进行非线性变换，多层叠加后，网络就能够逼近任意复杂的函数。这就是为什么深度神经网络如此强大。'
    }
  },
  {
    id: 'block-11',
    type: 'title',
    content: '常见的激活函数',
    metadata: {
      level: 2,
      section: 3,
      speech: '接下来，让我们看看几种常用的激活函数。选择合适的激活函数对网络性能有很大影响。'
    }
  },
  {
    id: 'block-12',
    type: 'list',
    content: [
      'ReLU: f(x) = max(0, x)',
      'Sigmoid: f(x) = 1 / (1 + e^(-x))',
      'Tanh: f(x) = (e^x - e^(-x)) / (e^x + e^(-x))'
    ],
    metadata: {
      section: 3,
      speech: '这里列出了三种最常用的激活函数。ReLU，也就是修正线性单元，是目前最流行的选择。它的计算非常简单，就是取零和输入值的最大值。Sigmoid 函数将输出压缩到零到一之间，常用于二分类问题。Tanh 函数类似 Sigmoid，但输出范围是负一到正一，在某些情况下收敛更快。每种激活函数都有其适用场景。'
    }
  },
  {
    id: 'block-13',
    type: 'code',
    content: `import torch
import torch.nn as nn

# 定义一个简单的神经网络
class SimpleNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(784, 128)
        self.fc2 = nn.Linear(128, 10)
        self.relu = nn.ReLU()

    def forward(self, x):
        x = self.relu(self.fc1(x))
        x = self.fc2(x)
        return x`,
    metadata: {
      language: 'python',
      section: 3,
      speech: '现在让我们看一个实际的代码例子。这是一个用 PyTorch 实现的简单神经网络。它有两个全连接层。第一层将 784 维的输入（比如 28x28 的图像）映射到 128 维。然后使用 ReLU 激活函数。第二层将 128 维映射到 10 维输出，对应 10 个类别。在 forward 方法中，我们定义了数据如何在网络中流动。这就是一个最基本的神经网络实现。'
    }
  },
  {
    id: 'block-14',
    type: 'insight',
    content: 'ReLU 是目前最常用的激活函数，因为它计算简单且能有效缓解梯度消失问题。',
    metadata: {
      section: 3,
      speech: 'ReLU 之所以如此流行，有两个主要原因。首先，它的计算非常简单，只需要一个比较操作，这使得训练速度很快。其次，也是更重要的，它能有效缓解梯度消失问题。在深层网络中，梯度在反向传播时可能会变得越来越小，导致底层网络无法有效学习。ReLU 的梯度要么是零，要么是一，这避免了梯度的指数级衰减。'
    }
  },
  {
    id: 'block-15',
    type: 'title',
    content: '反向传播算法',
    metadata: {
      level: 2,
      section: 4,
      speech: '现在我们来学习神经网络训练的核心算法：反向传播。这是深度学习能够工作的关键。'
    }
  },
  {
    id: 'block-16',
    type: 'text',
    content: '反向传播是训练神经网络的核心算法，它通过链式法则计算损失函数对每个参数的梯度。',
    metadata: {
      section: 4,
      speech: '反向传播算法是深度学习的基石。它的核心思想是利用微积分中的链式法则，从输出层开始，逐层向后计算损失函数对每个参数的梯度。有了这些梯度，我们就知道如何调整参数来减小损失。这个过程看似简单，但它使得训练包含数百万甚至数十亿参数的深度网络成为可能。'
    }
  },
  {
    id: 'block-17',
    type: 'formula',
    content: '\\frac{\\partial L}{\\partial w} = \\frac{\\partial L}{\\partial y} \\cdot \\frac{\\partial y}{\\partial w}',
    metadata: {
      section: 4,
      speech: '这个公式展示了链式法则的应用。我们想要计算损失 L 对权重 w 的梯度。通过链式法则，我们可以将其分解为两部分：损失对输出 y 的梯度，乘以输出对权重的梯度。这个简单的数学原理，让我们能够高效地计算深层网络中所有参数的梯度。'
    }
  },
  {
    id: 'block-18',
    type: 'list',
    content: [
      '前向传播：计算网络输出',
      '计算损失：比较输出与真实标签',
      '反向传播：计算梯度',
      '参数更新：使用梯度下降更新权重'
    ],
    metadata: {
      section: 4,
      speech: '训练神经网络是一个循环的过程，包含四个步骤。首先，前向传播，将输入数据通过网络得到预测输出。第二，计算损失，衡量预测与真实标签的差距。第三，反向传播，计算损失对所有参数的梯度。最后，参数更新，使用梯度下降算法调整权重。这四个步骤不断重复，网络的性能就会逐步提升。'
    }
  },
  {
    id: 'block-19',
    type: 'title',
    content: '优化算法',
    metadata: {
      level: 2,
      section: 5,
      speech: '有了梯度之后，我们需要优化算法来更新参数。让我们看看几种常用的优化方法。'
    }
  },
  {
    id: 'block-20',
    type: 'text',
    content: '除了基本的梯度下降，还有许多改进的优化算法可以加速训练过程。',
    metadata: {
      section: 5,
      speech: '基本的梯度下降算法虽然简单，但在实际应用中往往收敛较慢。研究人员开发了许多改进的优化算法，它们通过不同的策略来加速训练过程，提高收敛稳定性。这些算法在深度学习的成功中起到了关键作用。'
    }
  },
  {
    id: 'block-21',
    type: 'list',
    content: [
      'SGD：随机梯度下降',
      'Momentum：动量法',
      'Adam：自适应学习率',
      'RMSprop：均方根传播'
    ],
    metadata: {
      section: 5,
      speech: '这里列出了四种主要的优化算法。SGD 是最基础的，每次使用一小批数据更新参数。Momentum 引入了动量的概念，就像物理中的惯性，可以加速收敛并减少震荡。Adam 是目前最流行的选择，它自适应地调整每个参数的学习率。RMSprop 通过均方根来调整学习率，在某些问题上表现很好。'
    }
  },
  {
    id: 'block-22',
    type: 'insight',
    content: 'Adam 优化器结合了 Momentum 和 RMSprop 的优点，是目前最流行的优化算法之一。',
    metadata: {
      section: 5,
      speech: 'Adam 优化器之所以如此受欢迎，是因为它巧妙地结合了 Momentum 和 RMSprop 的优点。它既能利用动量加速收敛，又能自适应地调整学习率。在大多数情况下，使用 Adam 的默认参数就能获得不错的效果，这使得它成为深度学习实践者的首选。当然，对于特定问题，其他优化器可能表现更好，这需要实验来确定。'
    }
  },
  {
    id: 'block-23',
    type: 'code',
    content: `# 使用 Adam 优化器
optimizer = torch.optim.Adam(
    model.parameters(),
    lr=0.001,
    betas=(0.9, 0.999)
)

# 训练循环
for epoch in range(num_epochs):
    for batch in dataloader:
        optimizer.zero_grad()
        loss = criterion(model(batch.x), batch.y)
        loss.backward()
        optimizer.step()`,
    metadata: {
      language: 'python',
      section: 5,
      speech: '让我们看看如何在代码中使用 Adam 优化器。首先创建优化器实例，传入模型参数和学习率。betas 参数控制动量的衰减率。在训练循环中，我们首先清零梯度，然后计算损失，调用 backward 进行反向传播，最后调用 step 更新参数。这个简洁的代码模式是 PyTorch 训练的标准流程。'
    }
  },
  {
    id: 'block-24',
    type: 'title',
    content: '总结',
    metadata: {
      level: 2,
      section: 6,
      speech: '好的，让我们总结一下今天学到的内容。'
    }
  },
  {
    id: 'block-25',
    type: 'text',
    content: '本章介绍了深度学习的基础概念，包括神经网络结构、激活函数、反向传播和优化算法。',
    metadata: {
      section: 6,
      speech: '在这一章中，我们系统地学习了深度学习的核心概念。从神经网络的基本结构开始，了解了输入层、隐藏层和输出层的作用。我们学习了激活函数如何引入非线性，使网络能够学习复杂的模式。反向传播算法让我们能够高效地训练深层网络。最后，我们探讨了各种优化算法，它们帮助网络更快更稳定地收敛。'
    }
  },
  {
    id: 'block-26',
    type: 'insight',
    content: '掌握这些基础知识是深入学习更复杂的深度学习模型（如 CNN、RNN、Transformer）的前提。',
    metadata: {
      section: 6,
      speech: '这些基础知识非常重要，它们是理解更高级深度学习模型的基石。无论是用于图像识别的卷积神经网络，处理序列数据的循环神经网络，还是最近大火的 Transformer 架构，它们都建立在我们今天学习的这些基本概念之上。扎实掌握这些基础，你就能够更好地理解和应用各种深度学习技术。感谢你的学习，我们下节课见！'
    }
  }
];

export const mockLectureData = {
  blocks: mockLectureBlocks,
  total_sections: 6,
  total_blocks: mockLectureBlocks.length
};
