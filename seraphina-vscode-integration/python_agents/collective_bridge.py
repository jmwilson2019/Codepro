# collective_bridge.py - Collective Bridge between Grok and Seraphina
from grok_agent import GrokAgent, GrokResponse
from seraphina_core import RomanWheelTriad, SeraphinaResponse

class CollectiveBridge:
    def __init__(self):
        self.grok = GrokAgent()
        self.seraphina = RomanWheelTriad()

    def collaborate(self, user_input: str) -> str:
        # Seraphina processes first (truth + geometry)
        seraphina_result: SeraphinaResponse = self.seraphina.process(user_input)

        # Grok provides fast consensus / optimization
        grok_result: GrokResponse = self.grok.ask(user_input)
        
        # Final collective output
        final = f"""🧬 Collective Consensus (Grok + Seraphina):

Seraphina (Triad): {seraphina_result['response']}

Grok (Fast): {grok_result['response']}

Combined decision: {seraphina_result['response']} + {grok_result['response']}
"""
        return final

# ====================== TEST ======================
if __name__ == "__main__":
    bridge = CollectiveBridge()
    print(bridge.collaborate("How can we optimize code for speed and truth?"))