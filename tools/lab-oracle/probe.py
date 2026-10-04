"""Probe: verify Sage availability through WSL for oracle cross-checks."""
from sage.all import graphs
import sage.version

g = graphs.CompleteGraph(4)
print("edges:", g.num_edges())
print("graph6:", g.canonical_label().graph6_string())
print("sage:", sage.version.version)
