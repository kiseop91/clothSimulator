#pragma once

struct ClothSpring {
    enum Type { STRUCTURAL, SHEAR, BEND };

    int particleA;
    int particleB;
    float restLength;
    Type type;

    ClothSpring()
        : particleA(0), particleB(0), restLength(0.0f), type(STRUCTURAL)
    {}

    ClothSpring(int a, int b, float rest, Type t)
        : particleA(a), particleB(b), restLength(rest), type(t)
    {}
};
