#pragma once

struct ClothSpring {
    enum Type { STRUCTURAL, SHEAR, BEND };

    int particleA;
    int particleB;
    float restLength;
    float compliance;   // α = 1/stiffness (XPBD)
    float lambda;       // Lagrange multiplier (reset each substep)
    Type type;

    ClothSpring()
        : particleA(0), particleB(0), restLength(0.0f)
        , compliance(0.0f), lambda(0.0f), type(STRUCTURAL)
    {}

    ClothSpring(int a, int b, float rest, Type t, float comp = 0.0f)
        : particleA(a), particleB(b), restLength(rest)
        , compliance(comp), lambda(0.0f), type(t)
    {}
};
